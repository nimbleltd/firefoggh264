// -*- coding: utf-8 -*-
// vi:si:et:sw=2:sts=2:ts=2
/*
  Firefogg - video encoding for Firefox
             http://firefogg.org/
             2008, 2012 - GPL 3.0
 */
const Cc = Components.classes;
const Ci = Components.interfaces;
const Cu = Components.utils;

Cu.import("resource://gre/modules/AddonManager.jsm");
Cu.import("resource://gre/modules/XPCOMUtils.jsm");

Cu.import("resource://firefogg/utils.jsm");
Cu.import("resource://firefogg/encoder.jsm");
Cu.import("resource://firefogg/subprocess.jsm");
try {
  Cu.importGlobalProperties(["File"]);
} catch(e) {}


function Firefogg() {
  var that = this;
  this._enc = {};

  this.resultUrl = '';
  this.sourceFilename = '';
  this.sourceInfo = '{}';
  this.downloadVideo = {};

  this._domain = false;
  
  //cleanup if window is closed
  var windowMediator = Cc["@mozilla.org/appshell/window-mediator;1"].getService(Ci.nsIWindowMediator);
  var nsWindow = windowMediator.getMostRecentWindow("navigator:browser");
  this._window = nsWindow.content;

  this._window.addEventListener("unload", function() { that.shutdown() }, false);

  this._debug = false;
  try {
    this._debug = this._prefs.getBoolPref("debug");
  } catch(e) {
    this._prefs.setBoolPref("debug", false);
  }
  /*
  if (this._debug) {
    subprocess.registerDebugHandler(function(value) {
      utils.debug(value);
    });
    subprocess.registerLogHandler(function(value) {
      utils.debug(value);
    });
  }
  */
}

Firefogg.prototype = {
  classDescription: "Firefogg API",
  classID:          Components.ID("{5960e4b8-89d1-4c20-ae24-4d10d0900c4d}"),
  contractID:       "@firefogg.org/fireogg;1",

  _xpcom_factory : {
    createInstance: function (outer, iid) {
      if (outer != null)
        throw NS_ERROR_NO_AGGREGATION;
      return (new Firefogg()).QueryInterface(iid);
    }
  },
  _xpcom_categories : [{
    category: "JavaScript global constructor",
    entry: "Firefogg"
  }],
  _prefs : Cc["@mozilla.org/preferences-service;1"]
             .getService(Ci.nsIPrefService).getBranch("extensions.firefogg."),
  _window : null,
  _icon : null,
  _protocolCallbacks : {},

  QueryInterface: XPCOMUtils.generateQI(
    [Ci.nsIFirefogg,
     Ci.nsISupportsWeakReference,
     Ci.nsIClassInfo]),

  // nsIClassInfo
  implementationLanguage: Ci.nsIProgrammingLanguage.JAVASCRIPT,
  flags: Ci.nsIClassInfo.DOM_OBJECT,

  getInterfaces: function getInterfaces(aCount) {
    var interfaces = [Ci.nsIFirefogg,
                      Ci.nsISupportsWeakReference,
                      Ci.nsIClassInfo];
    aCount.value = interfaces.length;
    return interfaces;
  },

  getHelperForLanguage: function getHelperForLanguage(aLanguage) {
    return null;
  },

  //private
  _inputFile: false,
  _outputFile: false,
  _progress: 0,
  _format: 'ogg',

  //public nsIFirefogg
  version: "git",
  state: "selectfile",
  previewUrl: "",
  status: function() {
    return this.state;
  },
  encodingstatus: function() {
    return JSON.stringify(this._enc);
  },
  progress: function() {
    var p = this._progress;
    if (this.state == 'downloading' && this.downloadVideo.progress) {
      p = this.downloadVideo.progress;
    } else {
      p = this._progress;
    }
    return p;
  },
  setInputVideo: function(file) {
    var that = this;
    this._inputFile = file.path;
    this.sourceFilename = file.leafName;
    this.state = "";
    this.sourceInfo = JSON.stringify(ffenc.info(this._inputFile));
    this.source = new File(this._inputFile);

    var sequence = that._detect_image_sequence(file.path);
    if (sequence.path != file.path) {
      this._inputFile = sequence.path;
      this.sourceFilename = sequence.leafName;
    }
    return true;
  },
  selectVideo: function() {
    var that = this;
    var fp = Cc["@mozilla.org/filepicker;1"].createInstance(Ci.nsIFilePicker);
    fp.init(this._window, "Select file", Ci.nsIFilePicker.modeOpen);
    fp.appendFilters(Ci.nsIFilePicker.filterAll);
    var rv = fp.show();
    if (rv == Ci.nsIFilePicker.returnOK || rv == Ci.nsIFilePicker.returnReplace) {
        var file = fp.file;
        this._inputFile = file.path;
        this.sourceFilename = file.leafName;
        this.state = "";
        this.sourceInfo = JSON.stringify(ffenc.info(this._inputFile));
        this.source = new File(this._inputFile);

        var sequence = that._detect_image_sequence(file.path);
        if (sequence.path != file.path) {
          this._inputFile = sequence.path;
          this.sourceFilename = sequence.leafName;
        }
        return true
    }
    this.sourceFilename = '';
    this.sourceInfo = '{}';
    this._inputFile = false;
    this._outputFile = false;
    return false;
  },
  // drag and drop support
  // depends on https://bugzilla.mozilla.org/show_bug.cgi?id=526996
  setInput: function(file) {
    var that = this;
    var inputFile = Cc["@mozilla.org/file/local;1"].createInstance(Ci.nsIFile);
    try {
      inputFile.initWithPath(file.mozFullPath);
    } catch(e) {
      utils.debug('D&D support depends on https://bugzilla.mozilla.org/show_bug.cgi?id=526996');
    }
    this._inputFile = inputFile.path;
    this.sourceFilename = inputFile.leafName;
    this.state = "";
    this.sourceInfo = JSON.stringify(ffenc.info(this._inputFile));
    this.source = new File(this._inputFile);
    return true;
  },
  deleteVideo: function() {
    if (this._encoder) {
      this._encoder.cancel();
      this.state = "encoding canceled";
    }
    if(this._outputFile) {
      utils.removeFiles(this._outputFile);
    }
  },
  dropFile: function(file) {
    this.setFile(file);
  },
  saveVideoAs: function() {
    const nsIFilePicker = Ci.nsIFilePicker;
    var fp = Cc["@mozilla.org/filepicker;1"].createInstance(nsIFilePicker);
    fp.init(this._window, "Save video as...", nsIFilePicker.modeSave);
    fp.appendFilters(nsIFilePicker.filterAll);

    var path = this._inputFile;
    if(path) {
      var extension = '.ogv';
      if(this._format == 'webm') {
        extension = '.webm';
      }
      var input_extension = path.split('.');
      if (input_extension.length>1) {
        input_extension = '.' + input_extension[input_extension.length-1];
      } else {
        input_extension = '';
      }
      
      if (path.substr(-input_extension.length) == extension) {
        path = path +  extension;
      } else {
        path = path.substr(0, path.length-input_extension.length) + extension;
      }
      path = utils.newFile(path);

      var output = Cc["@mozilla.org/file/local;1"].createInstance(Ci.nsIFile);
      output.initWithPath(path);
      fp.displayDirectory = output.parent;
      fp.defaultString = output.leafName;
    }

    var rv = fp.show();
    if (rv == nsIFilePicker.returnOK || rv == nsIFilePicker.returnReplace) {
        var file = fp.file;
        if (file.exists()) {
          file.remove(false);
        }
        this.outputFileSelected = file.path;
        return true
    }
    return false;
  },
  setFormat: function(format) {
    if (format == 'ogg' || format == 'webm') {
      this._format = format;
      return true;
    }
    return false;
  },
  cancel: function() {

    if (this.downloadVideo.url && !this.downloadVideo.failed && 
        this.downloadVideo.progress != 1 && this.downloadVideo.persist) {
      this.downloadVideo.persist.cancelSave();
      this.downloadVideo.failed = true;
    }
    if (this._encoder) {
      this._encoder.cancel();
      this.state = "encoding canceled";
    }
    utils.debug("canceled");
    utils.debug(this.state);
    return this.state;
  },
  encode: function(options, callback, progress) {
    var that = this;
    //block while download is running
    if (this.downloadVideo.url && this.downloadVideo.progress != 1) {
      if (this.downloadVideo.failed) {
        return;
      }
      var timer = Cc["@mozilla.org/timer;1"].createInstance(Ci.nsITimer);
      //wait for download to finish, try again later
      //var p = parseInt(this.downloadVideo.progress * 100);
      //utils.debug(""+this.downloadVideo.url+" still downloading ("+p+"%), waiting with encoding");
      timer.initWithCallback(function() { that.encode(options, callback, progress) },
                             500, Ci.nsITimer.TYPE_ONE_SHOT);
      return;
    }

    if(callback)
      callback = callback.callback;
    if(progress)
      progress = progress.callback;

    //select file if nothing is selected
    if (!this._inputFile) {
      utils.debug("no input selecte, cancel encoding");
      this.state = "no input selected";
      return;
    }
    utils.debug('encoding ' + options);
    options = JSON.parse(options);

    //in passthrough just set output to selected file,
    //to allow encode/post with passthrough
    if (options.passthrough) {
      this._outputFile = this._inputFile;
      this._inputFile = null;
      this.state = "encoding done";
      if(callback) {
        let data = JSON.stringify({
          progress: 1,
          state: this.state
        });
        this.video = Cu.cloneInto(new File(this._outputFile), this._window);
        callback(data, this.video);
      }
      return;
    }

    if (this.outputFileSelected) {
      this._outputFile = this.outputFileSelected;
    } else {
      this._outputFile = this._inputFile;
      if (options.videoCodec == 'vp8' || options.videoCodec == 'vp9' || this._format == 'webm') {
        var extension = options.novideo?'.webma':'.webm';
      } else {
        var extension = options.novideo?'.ogg':'.ogv';
      }

      var ext_in = this._outputFile.split(".");
      if(ext_in.length > 1) {
        ext_in = '.' + ext_in[ext_in.length-1];
      } else {
        ext_in = '';
      }
      if (ext_in == extension) {
        this._outputFile =  this._outputFile + extension;
      } else {
        this._outputFile =  this._outputFile.substr(0, this._outputFile.length-ext_in.length) + extension;
      }
      this._outputFile = utils.newFile(this._outputFile);
    }

    //register output with preview protocol
    var p = Cc["@mozilla.org/network/protocol;1?name=firefogg"]
              .getService(Ci.nsIFirefoggProtocol);
    this.previewUrl = p.addUrl("file://" + this._outputFile);


    this.state = "encoding";
    this._encoder = new FirefoggEncoder(
      this._inputFile, 
      this._outputFile, 
      options,
      function(data) {
        that._enc.progress = 1;
        utils.debug("encoding done.");
        if (data.exitCode == 0) {
          that.state = "encoding done";
          that._enc.progress = that._progress;
          that._progress = 1.0;
          if(callback) {
            var data = {
                progress: 1,
                preview: that.previewUrl,
                state: 'done',
                info: ffenc.info(that._outputFile),
              };
            that.video = Cu.cloneInto(new File(that._outputFile), that._window);
            callback(JSON.stringify(data), that.video);
          }
        } else {
          utils.debug("encoding failed");
          that._enc.progress = -1;
          that.sate = "encoding failed";
          if(callback)
            callback(JSON.stringify({
                progress: -1,
                state: that.state
            }))
        }
      },
      function(data) {
        that._enc = data;
        if(that._enc.progress)
          that._progress = that._enc.progress;
        if(progress) {
          var info = JSON.stringify({
            progress: that._enc.progress,
            position: that._enc.position,
            duration: that._enc.duration,
            state: that.state,
            preview: that.previewUrl 
          });
          var ofile = Cc["@mozilla.org/file/local;1"].createInstance(Ci.nsIFile);
          ofile.initWithPath(that._outputFile);
          if(ofile.exists()) {
            progress(info, Cu.cloneInto(new File(that._outputFile), that._window));
          } else {
            progress(info);
          }
        }
      });
  },

  selectVideoUrl: function(url) {
    /*
      select remote url to be used for encoding.
    */
    var that = this;
    
    if(url.substr(0,4) != "http") {
      utils.debug('only http(s) urls are supported right now.');
      return false;
    }

    that.downloadVideo.url = url;
    that.downloadVideo.progress = 0;
    that.state = "downloading";

    var sourceFilename = url.split("/");
    sourceFilename = sourceFilename[sourceFilename.length-1];
    that.downloadVideo.sourceFilename = sourceFilename;

    var extension = sourceFilename.split('.');
    extension = extension[extension.length-1];
    if (extension == sourceFilename) {
      extension = "video";
    }
    extension = '.' + extension;

    var file = Cc["@mozilla.org/file/directory_service;1"]
                 .getService(Ci.nsIProperties).get("TmpD", Ci.nsIFile);
    file.append("Firefogg" + Math.random() + extension);
    that.downloadVideo.path = file.path;

    //create URIs of the source  
    var io = Cc["@mozilla.org/network/io-service;1"].getService(Ci.nsIIOService);
    var sourceUrl = io.newURI(url, null, null);

    // prepare to save data
    that.downloadVideo.persist = Cc["@mozilla.org/embedding/browser/nsWebBrowserPersist;1"]
                    .createInstance(Ci.nsIWebBrowserPersist);
    var persist = that.downloadVideo.persist; 

    persist.persistFlags = Ci.nsIWebBrowserPersist.PERSIST_FLAGS_REPLACE_EXISTING_FILES;
    persist.persistFlags |= Ci.nsIWebBrowserPersist.PERSIST_FLAGS_FROM_CACHE;
    // get progress while downloading
    persist.progressListener = {
      onProgressChange: function(aWebProgress, aRequest, aCurSelfProgress, aMaxSelfProgress, aCurTotalProgress, aMaxTotalProgress) {
        that.downloadVideo.progress = aCurTotalProgress/aMaxTotalProgress;
      },
      onStatusChange: function(aWebProgress, aRequest, aStatus, aMessage) {
      },
      onStateChange: function(aWebProgress, aRequest, aStatus, aMessage) {
        if (aStatus & Ci.nsIWebProgressListener.STATE_STOP) {
            try {
              var request = aRequest.QueryInterface(Ci.nsIHttpChannel);
              if (request.responseStatus == 200) {
                that.downloadVideo.progress = 1;
                that.state = "downloaded";
                that._inputFile = that.downloadVideo.path;
                that.sourceFilename = that.downloadVideo.sourceFilename;
                that.sourceInfo = JSON.stringify(ffenc.info(that._inputFile));
              } else {
                that.state = "download failed";
                that.downloadVideo.failed = true;
                utils.debug("failed " + request.responseStatus);
                utils.debug("" + aWebProgress + aRequest + aStatus + aMessage);
              }
            }
            catch(e) {
                that.state = "download failed";
                that.downloadVideo.failed = true;
                utils.debug("failed " + e);
                utils.debug("" + aWebProgress + aRequest + aStatus + aMessage);
            }
        }
        //do something
      }
    }

    // save data from url to file
    persist.saveURI(sourceUrl, null, null, null, null, file);

    return true;
  },

  //private functions
  _detect_image_sequence: function(path) {
    var ppii = path.lastIndexOf(".");
    var extension = path.substring(ppii, path.length);
    //ffmpeg path for image sequence:
    if(extension == ".bmp" || extension == ".png" || extension == ".gif" || extension == ".jpg" || extension == ".jpeg") {
      var prefix = path.substring(0, ppii);
      var digits = 0;
      while(prefix.substr(prefix.length-1, 1) == "0"
            || (digits == 0 && prefix.substr(prefix.length-1, 1) == "1")) {
        prefix = prefix.substring(0, prefix.length-1);
        digits++;
      }
      if(digits)
        path = prefix + "%0" + digits + "d" + extension;
    }
    var file = Cc["@mozilla.org/file/local;1"].createInstance(Ci.nsIFile);
    file.initWithPath(path);
    return file;
  },
  shutdown: function() {
    this.cancel();
  }
}

var NSGetFactory = XPCOMUtils.generateNSGetFactory([Firefogg]);
