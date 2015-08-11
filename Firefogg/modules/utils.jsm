// -*- coding: utf-8 -*-
// vi:si:et:sw=2:sts=2:ts=2:ft=javascript

Components.utils.import("resource://gre/modules/FileUtils.jsm");


let EXPORTED_SYMBOLS = [ "utils" ];

const Cc = Components.classes;
const Ci = Components.interfaces;

let utils = {
    extensionId: "firefogg@firefogg.org",
    prefs: Cc["@mozilla.org/preferences-service;1"].getService(Ci.nsIPrefService).getBranch("extensions.firefogg."),
    app: Cc["@mozilla.org/fuel/application;1"].getService(Ci.fuelIApplication),
    debug: function(msg) {
        var debug = false;
        try {
            debug = this.prefs.getBoolPref("debug");
        } catch(e) {
            this.prefs.setBoolPref("debug", false);
        }
        if (debug)
          this.app.console.log("Firefogg: " + msg);
    },
    setTimeout: function(callback, timeout) {
        var timer = Cc["@mozilla.org/timer;1"].createInstance(Ci.nsITimer);
        timer.initWithCallback(callback, timeout, Ci.nsITimer.TYPE_ONE_SHOT);
    },
    setInterval: function(callback, timeout) {
        var timer = Cc["@mozilla.org/timer;1"].createInstance(Ci.nsITimer);
        timer.initWithCallback(callback, timeout, Ci.nsITimer.TYPE_REPEATING_SLACK);
        return timer;
    },
    glob: function (path) {
        /*
        return array of all files(in all subdirectories) for given directory
        */
        var directory = Cc["@mozilla.org/file/local;1"].createInstance(Ci.nsIFile);
        directory.initWithPath(path);
        var entries = directory.directoryEntries;
        var array = [];
        while(entries.hasMoreElements()) {
            var entry = entries.getNext();
            entry.QueryInterface(Components.interfaces.nsIFile);
            if(entry.isDirectory()) {
                var sub = this.glob(entry.path);
                for(i in sub) {
                    array.push(sub[i]);
                }
            } else {
                array.push(entry.path);
            }
        }
        return array;
    },
    makeRandomString: function(len) {
        var s = "";
        var table = [
            'a','b','c','d','e','f','g','h','i','j',
            'k','l','m','n','o','p','q','r','s','t',
            'u','v','w','x','y','z','0','1','2','3',
            '4','5','6','7','8','9' 
        ];
        for(var i=0;i<len;i++) {
            s += table[parseInt(Math.random() * table.length)];
        }
        return s;
    },
    padInt: function(n, len) {
        var str = '' + n;
        var pad = '0';
        while (str.length < len) {
          str = pad + str;
        }
        return str;
    },
    parseFraction: function(f) {
        fraction = {};
        fraction.num = 1;
        fraction.denom = 1;
        fraction.toString = function() {
            return this.num/this.denom;
        };
        f = f.toString();
        f = f.split(':');
        if (f.length == 1)
            f = f[0].split('/');
        if (f.length == 1) {
            if(parseFloat(f[0]) === parseInt(f[0]))
                f = [parseInt(f[0]), 1];
            else
                f = [parseInt(parseFloat(f[0]) * 1000), 1000];
        }
        fraction.num = f[0];
        fraction.denom = f[1];
        return fraction;
    },
    newFile: function(filename) {
        var f = Cc["@mozilla.org/file/local;1"].createInstance(Ci.nsIFile);
        var i = 2;
        var extension = filename.split(".");
        if(extension.length > 1) {
            extension = '.' + extension[extension.length-1];
        } else {
            extension = '';
        }
        var new_filename = filename;
        while (1) {
            f.initWithPath(new_filename);
            if (!f.parent.isWritable()) {
              var tmp = FileUtils.getFile("TmpD", [f.leafName]);
              tmp.createUnique(Components.interfaces.nsIFile.NORMAL_FILE_TYPE,
                  FileUtils.PERMS_FILE);
              tmp.remove(false);
              new_filename = tmp.path;
              break;
            } else {
              if(f.exists()) {
                  new_filename =  filename.substr(0, filename.length-extension.length)
                    + ' ' + i + extension;
                  i++;
              } else {
                  break;
              }
            }
        }
        return new_filename;
    },
    request: function(options) {
        var url = options.url,
            data = options.data,
            boundary = "--------XX" + Math.random();

        var converter = Cc["@mozilla.org/intl/scriptableunicodeconverter"]
                          .createInstance(Ci.nsIScriptableUnicodeConverter);
        converter.charset = "UTF-8";

        var req = Cc["@mozilla.org/xmlextras/xmlhttprequest;1"]
                    .createInstance(Ci.nsIXMLHttpRequest);

        var multiStream = Cc["@mozilla.org/io/multiplex-input-stream;1"]
                            .createInstance(Ci.nsIMultiplexInputStream);

        if(options.progress)
            req.upload.addEventListener("progress", options.progress, false);
        if(options.load)
            req.addEventListener("load", options.load, false);
        if(options.error)
            req.addEventListener("error", options.error, false);
        if(options.abort)
            req.addEventListener("abort", options.abort, false);

        function appendData(key, value) {
            if(value.leafName) {
              try {
                var mimeService = Cc["@mozilla.org/mime;1"].createInstance(Ci.nsIMIMEService);
                var mimeType = mimeService.getTypeFromFile(value);
              }
              catch(e) {
                var mimeType = "application/octet-stream";
              }

              var filename = value.leafName;
              var formData = "--" + boundary + "\r\n" +
                             "Content-Disposition: form-data; name=\"" + key +
                             "\"; filename=\"" + filename + "\"\r\n" +
                             "Content-type: " + mimeType + "\r\n\r\n";
              var formData = converter.convertToInputStream(formData);
              multiStream.appendStream(formData);

              var fileStream = Cc["@mozilla.org/network/file-input-stream;1"]
                                 .createInstance(Ci.nsIFileInputStream);
              fileStream.init(value, 0x01, 0644, 0x04); // file is an nsIFile instance
              multiStream.appendStream(fileStream);

              formData = "\r\n";
              formData = converter.convertToInputStream(formData);
              multiStream.appendStream(formData);

            } else {
              var formData = "--" + boundary + "\r\n" +
                          "Content-Disposition: form-data; name=\""+key+"\"\r\n\r\n" +
                          value + "\r\n";
              formData = converter.convertToInputStream(formData);
              multiStream.appendStream(formData);
            }
        }
        if (data) {
            for(key in data) {
                if (typeof(data[key]) == 'object' && data[key].length>0) {
                    for(i in data[key])
                        appendData(key, data[key][i]);
                } else if (data[key]) {
                    appendData(key, data[key]);
                }
            }
        }
        var formData = "--" + boundary + "--\r\n";
        formData = converter.convertToInputStream(formData);
        multiStream.appendStream(formData);

        req.open("POST", url);
        req.setRequestHeader("Content-type", "multipart/form-data; boundary=" + boundary);
        req.setRequestHeader("Content-length", multiStream.available());
        req.send(multiStream);
        return req;
    },
    removeFiles: function(filename) {
        [filename, filename+'.log-0.log'].forEach(function(filename) {
            var file = Cc["@mozilla.org/file/local;1"].createInstance(Ci.nsIFile);
            file.initWithPath(filename);
            if(file.exists()) {
                try {
                    file.remove(false);
                } catch(e) {}
            }
        });
    },
};

