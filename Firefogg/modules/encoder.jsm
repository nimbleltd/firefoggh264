// -*- coding: utf-8 -*-
// vi:si:et:sw=2:sts=2:ts=2:ft=javascript

Components.utils.import("resource://firefogg/subprocess.jsm");
Components.utils.import("resource://firefogg/utils.jsm");

let EXPORTED_SYMBOLS = [ "FirefoggEncoder", "ffenc" ];

const Cc = Components.classes;
const Ci = Components.interfaces;

const FIREFOGG_ID = "firefogg@firefogg.org";

let ffenc = {
  ready: false,
  _init: function() {
    if(!this.ready) {
      var _this = this;
      _this.ready=true;

      var exec_name = "ffmpeg2theora";
      var xulRuntime = Cc["@mozilla.org/xre/app-info;1"].getService(Ci.nsIXULRuntime);
      this._is_windows = false;
      if (xulRuntime.OS.indexOf("WIN") != -1) {
        exec_name = "ffmpeg2theora.exe";
        this._is_windows = true;
      }
      var file = __LOCATION__.parent.parent.QueryInterface(Ci.nsIFile);
      file.appendRelativePath('chrome');
      file.appendRelativePath('content');
      file.appendRelativePath('mime.types');
      this.mimetypesfile = file.path;

      var file = __LOCATION__.parent.parent.QueryInterface(Ci.nsIFile);
      file.appendRelativePath('bin');
      file.appendRelativePath(exec_name);
      var ffmpeg2theora = file.path;
      
      if (file.exists()) {
        this._cmd_base = ffmpeg2theora.replace('ffmpeg2theora', '_cmd_');
      } else {
        this._cmd_base = "/usr/local/bin/_cmd_";
      }
    }
  },
  bin: function(cmd) {
    cmd = this._cmd_base.replace('_cmd_', cmd);
    return cmd;
  },
  subprocess: function(command, args, callback, progress) {
    var _this = this,
        result;
    progress = typeof(progress) == 'function' ? progress : undefined;

    /*
    var dbg = 'subprocess:\n'+command+' \\\n';
    for(var i=0;i<args.length;i++)
      dbg += '\t"' + args[i] + '" \\\n';
    utils.debug(dbg);
    dump(dbg);
    */

    if(!this._is_windows &&
       command.substr(0, 15) != "/usr/local/bin/" &&
       command.substr(0, 9) != "/usr/bin/") {
       var cmd = Cc["@mozilla.org/file/local;1"].createInstance(Ci.nsIFile);
       cmd.initWithPath(command);
       cmd.permissions = 0755;
    }
    var p = subprocess.call({
      command: command,
      arguments: args,
      stdout: progress,
      done: function(r) {
        result = r.stdout;
        callback && callback({
            status: r.exitCode === 0 ? 'ok' : 'failed',
            exitCode: r.exitCode,
            stdoutData: r.stdout
        });
      }
    });
    if(!callback) {
      p.wait();
      return result;
    }
    return p;
  },
  
  info: function(filename, callback) {
    /*
      extract information from file
      filename  file to inspect
      callback  first argument is object containing file info
    */

    var _this = this;
    function getInfo(data) {
      try {
        var info = JSON.parse(data);
      } catch(e) {
        try {
          var info = JSON.parse(data.replace(/"metadata": {[^]*?},\n/g, ''));
        } catch(e) {
          var info = {"format": "unknown"};
        }
      }
      var file = Cc["@mozilla.org/file/local;1"].createInstance(Ci.nsIFile);
      file.initWithPath(filename);
      info.contentType = _this.getMimeType(file);
      //do not expose local path
      info.path = file.leafName;
      info.video && info.video.forEach(function(video) {
        if (!video.display_aspect_ratio) {
          video.display_aspect_ratio = video.width + ':' + video.height;
          video.pixel_aspect_ratio = '1:1';
        }
      });
      return info;
    }
    if(callback) {
      var p = this.subprocess(this.bin('ffmpeg2theora'), [filename, '--info'], function(data) {
        var info = getInfo(data.stdoutData);
        callback(info);
      });
      return p;
    } else {
      var info = this.subprocess(this.bin('ffmpeg2theora'), [filename, '--info']);
      return getInfo(info);
    }
  },
  getMimeType: function(file) {
    /*
      get mimetype for file, use firefox service and fallback to own detection
    */
    var contentType = "text/plain";
    try {
      contentType = Cc["@mozilla.org/mime;1"].getService(Ci.nsIMIMEService).getTypeFromFile(file);
    }
    catch (e) {
      contentType = this.getMimeTypeFromFile(file.path);
    }
    if(contentType == 'binary/octet-stream')
      contentType = this.getMimeTypeFromFile(file.path);
    //utils.debug("getMimeType " + contentType);
    return contentType;
  },
  getMimeTypeFromFile: function(filename) {
    /*
      mimetype based on extensions from chrome/content/mime.types
    */

    var ext = filename.split('.');
    ext = ext[ext.length-1];

    var file = Cc["@mozilla.org/file/local;1"].createInstance(Ci.nsIFile);
    file.initWithPath(this.mimetypesfile);

    var fstream = Cc["@mozilla.org/network/file-input-stream;1"].createInstance(Ci.nsIFileInputStream);
    fstream.init(file, 1, 1, Ci.nsIFileInputStream.CLOSE_ON_EOF);
    var bstream = Cc["@mozilla.org/network/buffered-input-stream;1"].createInstance(Ci.nsIBufferedInputStream);
    bstream.init(fstream, 4096);
    var binary = Cc["@mozilla.org/binaryinputstream;1"].createInstance(Ci.nsIBinaryInputStream);
    binary.setInputStream(fstream);
    var mimetypes = binary.readBytes(binary.available());

    mimetypes = mimetypes.replace(/^\s+|\s+$/g,"").split('\n'); // strip and split at newlines
    for(var i=0; i < mimetypes.length; i++) {
      var line = mimetypes[i];
      if(line[0] != '#') {
        line = line.split('\t');
        if(line.length == 1) {
          line = line[0].split(' ');
        }
        if(line.length >= 1) {
          var mimetype = line[0];
          var mime_ext = line[line.length-1];
          for(var j=1;j < line.length;j++) {
            mime_ext = line[j].replace(/^\s+|\s+$/g,"");
            if (mime_ext) {
              mime_ext = mime_ext.split(' ');
              for(var k=0;k < mime_ext.length;k++) {
                if (ext == mime_ext[k]) {
                  return mimetype;
                }
              }
            }
          }
        }
      }
    }
    return "text/plain";
  },
  getFrame: function(input, position, callback) {
    var command= this.bin('ffmpeg'),
        info = this.info(input),
        options,
        output = Cc["@mozilla.org/file/directory_service;1"]
                   .getService(Ci.nsIProperties).get("TmpD", Ci.nsIFile);
    output.append("FirefoggFrame"+position+".jpg");
    output.createUnique(Ci.nsIFile.NORMAL_FILE_TYPE, 0666);
    options = ['-y', '-ss', postion.toString(), '-i', input,
               '-f', 'mjpeg', '-an', '-vframes', '1', output.path]; 
    //options = ffenc.ffmpeg_options(input, encodingOptions, options, info, 'jpg');
    return this.subprocess(command, options, function(data) {
      callback(output.path);
    });
  },
  getFramerate: function(fps) {
    fps = fps.toString().split(':');
    if(fps.length == 2)
      fps = parseInt(fps[0]) / parseInt(fps[1]);
    else
      fps = parseFloat(fps[0]);
    return fps;
  },
  ffmpeg_options: function(input, output, options, info, pass) {
    var vf = [];
    if (typeof(pass) == 'undefined') {
      pass = 0;
    }

    // i/o
    var cmd_options = [
      "-y",
      "-progress", "-",
      "-i", input
    ];

    cmd_options[cmd_options.length] = "-map_metadata";
    cmd_options[cmd_options.length] = "-1";

    if (options.novideo) {
      cmd_options[cmd_options.length] = "-vn";
    } else {
      cmd_options = cmd_options.concat([
        "-threads", "4"
      ]);
      if (options.videoCodec == 'vp9') {
        cmd_options = cmd_options.concat([
          "-rc_lookahead", "24",
          "-tile-columns",  "4",
        ]);
        if (pass == 1) {
          cmd_options = cmd_options.concat([
            "-cpu-used", "4"
          ]);
        } else {
          cmd_options = cmd_options.concat([
            "-cpu-used", "1"
          ]);
        }
      } else {
        cmd_options = cmd_options.concat([
          "-skip_threshold", "0",
          "-rc_buf_aggressivity", "0",
          "-bufsize", "6000k",
          "-rc_init_occupancy", "4000",
          "-deadline", "good",
          "-cpu-used", "0"
        ]);
      }
      if (pass != 0) {
        cmd_options = cmd_options.concat([
          "-auto-alt-ref", "1",
          "-lag-in-frames", "16"
        ]);
      }

      if (options.videoQuality >= 0) {
        if (options.videoCodec == 'vp9') {
          var qmax = 63 - parseInt(parseInt(options.videoQuality)/10 * 40);
          cmd_options = cmd_options.concat([
            "-qmin", "0",
            "-qmax", String(qmax)
          ]);
        } else {
          //map 0-10 to 63-0, higher values worse quality
          var quality = 63 - parseInt(parseInt(options.videoQuality)/10 * 63);
          cmd_options = cmd_options.concat([
            "-crf", String(quality),
            "-qmin", String(quality),
            "-qmax", String(quality)
          ]);
        }
      }
      if (options.videoBitrate) {
        cmd_options = cmd_options.concat([
          "-vb", "" + parseInt(options.videoBitrate, 10) + "k"
        ]);
      }
      cmd_options = cmd_options.concat([
        "-vcodec", options.videoCodec == 'vp9' ? "libvpx-vp9" : "libvpx"
      ]);
    }
    if (options.aspect) {
        var display_aspect_ratio = options.aspect;
    } else {
      //dump('aspect ' + info.video[0]);
      if(info.video[0].display_aspect_ratio) {
        var display_aspect_ratio = info.video[0].display_aspect_ratio;
      } else {
        var display_aspect_ratio = info.video[0].width+":"+info.video[0].height;
      }
    }
    var dar = display_aspect_ratio.toString().split(':');
    dar = parseInt(dar[0]) / parseInt(dar[1]);

    function parseMaxSize(maxsize) {
      maxsize = (maxsize || '').toString();
      if (maxsize.indexOf('x') > -1) {
        maxsize = maxsize.split('x').map(function(i) { return parseInt(i, 10) });
      } else if(maxsize.length) {
        maxsize = parseInt(maxsize, 10);
        maxsize = [maxsize, maxsize];
      } else {
        maxsize = null;
      }
      return maxsize;
    }
    options.maxSize = parseMaxSize(options.maxSize);

    if (options.noUpscaling) {
      if(info.video && info.video.length>0) {
        var sourceWidth = info.video[0].width;
        var sourceHeight = info.video[0].height;
        var maxSourceSize = [sourceWidth, sourceHeight];
        if(options.maxSize != null
          && options.maxSize[0]>maxSourceSize[0]
          && options.maxSize[1]>maxSourceSize[1]) {
          options.maxSize = maxSourceSize;
        }
        if (options.width && parseInt(options.width) > sourceWidth)
          options.width = sourceWidth;
        if (options.height && parseInt(options.height) > sourceHeight)
          options.height = sourceHeight;

        if (options.framerate) {
          if(ffenc.getFramerate(options.framerate) > ffenc.getFramerate(info.video[0].framerate))
            delete options.framerate;
        }
      }
      if(info.audio && info.audio.length>0) {
        var sourceSamplerate = info.audio[0].sampleate;
        var sourceChannels = info.audio[0].channels;
        if (options.samplerate && parseInt(options.samplerate) > sourceSamplerate)
          delete options.sampleate;
        if (options.channels && parseInt(options.channels) > sourceChannels)
          delete options.channels;
      }
    }

    if (options.framerate) {
      cmd_options[cmd_options.length] = "-r";
      cmd_options[cmd_options.length] = String(options.framerate);
      var _enc_framerate = options.framerate;
    } else {
      var _enc_framerate = info.video[0].framerate;
    }
    var _f = _enc_framerate.toString().split(':');
    if(_f.length == 2)
      _enc_framerate = parseInt(_f[0]) / parseInt(_f[1]);
    else
      _enc_framerate = parseFloat(_enc_framerate);
    if (options.starttime) {
      cmd_options[cmd_options.length] = "-ss";
      cmd_options[cmd_options.length] = String(options.starttime);
    }
    if (options.endtime) {
      cmd_options[cmd_options.length] = "-t";
      cmd_options[cmd_options.length] = String(parseInt(options.endtime)-parseInt(options.starttime));
    }

    //crop
    var crop = {
      width: width,
      height: height,
      x: 0,
      y: 0
    };
    if (options.cropTop) {
      crop.height -= parseInt(options.cropTop);
      crop.y += parseInt(options.cropTop);
    }
    if (options.cropBottom) {
      crop.height -= parseInt(options.cropBottom);
    }
    if (options.cropLeft) {
      crop.width -= parseInt(options.cropLeft);
      crop.x += parseInt(options.cropLeft);
    }
    if (options.cropRight) {
      crop.width -= parseInt(options.cropRight);
    }
    if(options.cropTop || options.cropBottom ||
       options.cropLeft || options.cropRight)
      vf[vf.length] = 'crop='+crop.width+':'+crop.height+':'+crop.x+':'+crop.y;

    if (options.maxSize != null) {
      var sourceWidth = info.video[0].width;
      var sourceHeight = info.video[0].height;
      var maxSizeAspectRatio = options.maxSize[0] / options.maxSize[1];
      if (sourceWidth > sourceHeight && maxSizeAspectRatio <= dar) {
        var width = options.maxSize[0];
        var height = parseInt(width / dar);
        height = height + height%2;
      } else {
        var height = options.maxSize[1];
        var width = parseInt(height * dar);
        width = width + width%2;
      }
      options.width = width;
      options.height = height;
      vf[vf.length] = 'scale=' + String(options.width) + ':' + String(options.height);
      display_aspect_ratio = width + ':' + height;
    } else if (options.width && parseInt(options.width) > 0 || options.height && parseInt(options.height) > 0) {
      if (!options.width) {
        options.width = parseInt(options.height * dar);
        options.width = options.width + options.width%2;
        display_aspect_ratio = options.width + ':' + options.height;
      } else if (!options.height) {
        options.height = parseInt(options.width / dar);
        options.height = options.height + options.height%2;
        display_aspect_ratio = options.width + ':' + options.height;
      }
      vf[vf.length] = 'scale=' + String(options.width) + ':' + String(options.height);
    }
    cmd_options[cmd_options.length] = "-aspect";
    cmd_options[cmd_options.length] = display_aspect_ratio;

    var k = options.keyframeInterval ? parseInt(options.keyframeInterval) : 250;
    cmd_options[cmd_options.length] = "-g";
    cmd_options[cmd_options.length] = String(k);
    //cmd_options[cmd_options.length] = "-keyint_min";
    //cmd_options[cmd_options.length] = String(keyframeInterval);

    /*
    if (options.bufferDelay) {
      cmd_options[cmd_options.length] = "--buf-delay";
      cmd_options[cmd_options.length] = String(options.bufferDelay);
    }
    if (options.softTarget) {
      cmd_options[cmd_options.length] = "--soft-target";
    }
    */

    // compute bitrate if not set
    if (options.twopass
      && options.videoQuality >= 0 && typeof options.videoBitrate == 'undefined') {
      var bpp = (options.videoCodec == 'vp9' ? 0.09 : 0.13)
                  + 0.01 * parseFloat(options.videoQuality),
          width = parseInt(options.width || info.video[0].width),
          height = parseInt(options.height || info.video[0].height),
          fps;
      if (options.framerate) {
        fps = ffenc.getFramerate(options.framerate);
      } else {
        fps = ffenc.getFramerate(info.video[0].framerate);
      }
      cmd_options = cmd_options.concat([
        "-vb", "" + parseInt((height * width * fps * bpp) / 1000) + "k"
      ]);
    }

    if (options.deinterlace) {
      vf[vf.length] = "yadif";
    }
    if (options.denoise) {
      vf[vf.length] = 'hqdn3d';
    }
    var eq2 = {
      gamma: '1.0',
      brightness: '0.0',
      saturation: '1.0',
      contrast: '1.0'
    };

    if (options.brightness) {
      eq.brightness = String(options.brightness);
    }
    if (options.contrast) {
      eq.contrast = String(options.contrast);
    }
    if (options.gamma) {
      eq.gamma = String(options.gamma);
    }
    if (options.saturation) {
      eq.saturation = String(options.saturation);
    }
    if (options.brightness || options.contrast || options.gamma)
      vf[vf.length] = 'mp=eq2='+eq2.gamma+':'+eq2.contrast+':'+eq2.brightness+':'+eq2.saturation;

    if (vf.length > 0) {
      cmd_options[cmd_options.length] = "-vf";
      cmd_options[cmd_options.length] = vf.join(',');
    }
    /*
    if (options.postprocessing) {
      cmd_options[cmd_options.length] = "--pp";
      cmd_options[cmd_options.length] = String(options.pp);
    }
    */

    if (pass == 1 || options.noaudio) {
      cmd_options[cmd_options.length] = "-an";
    } else {
      //audio
      if (!options.audioQuality && !options.audioBitrate) {
        options.audioQuality = 3;
      }

      if (options.audioCodec == 'opus'
          && typeof options.audioQuality != 'undefined') {
          options.audioBitrate = {
            '-1': 32,
            '0': 48,
            '1': 64,
            '2': 96,
            '3': 112,
            '4': 128,
            '5': 144,
            '6': 160,
            '7': 192,
            '8': 256,
            '9': 320,
            '10': 512,
          }[''+parseInt(options.audioQuality, 10)];
          delete options.audioQuality;
      }
      if (options.audioQuality) {
        cmd_options[cmd_options.length] = "-aq";
        cmd_options[cmd_options.length] = String(options.audioQuality);
      }
      if (options.audioBitrate) {
        var ab = parseInt(options.audioBitrate) * 1000;
        cmd_options[cmd_options.length] = "-ab";
        cmd_options[cmd_options.length] = String(ab);
      }
      if (options.audioCodec == 'opus') {
        options.samplerate = 48000;
      }
      if (options.samplerate) {
        cmd_options[cmd_options.length] = "-ar";
        cmd_options[cmd_options.length] = String(options.samplerate);
      }
      if (options.channels) {
        cmd_options[cmd_options.length] = "-ac";
        cmd_options[cmd_options.length] = String(options.channels);
      }

      if (options.audioCodec == 'opus') {
        cmd_options[cmd_options.length] = "-strict";
        cmd_options[cmd_options.length] = "-2";
        cmd_options[cmd_options.length] = "-acodec";
        cmd_options[cmd_options.length] = "libopus";
        cmd_options[cmd_options.length] = "-frame_duration";
        cmd_options[cmd_options.length] = "20";
      } else {
        cmd_options[cmd_options.length] = "-acodec";
        cmd_options[cmd_options.length] = "libvorbis";
      }
    }

    cmd_options[cmd_options.length] = "-sn";

    cmd_options[cmd_options.length] = "-f";
    cmd_options[cmd_options.length] = "webm";

    if (pass!=0) {
      cmd_options[cmd_options.length] = "-pass";
      cmd_options[cmd_options.length] = String(pass);
      cmd_options[cmd_options.length] = "-passlogfile";
      cmd_options[cmd_options.length] = output + '.log';
    }

    if (pass==1) {
      if(this._is_windows) {
        cmd_options[cmd_options.length] = 'NUL';
      } else {
        cmd_options[cmd_options.length] = '/dev/null';
      }
    } else {
      cmd_options[cmd_options.length] = output;
    }
    return cmd_options;
  },
  ffmpeg2theora_options: function(input, output, options, info) {
    var cmd_options = [];
    // i/o
    cmd_options[cmd_options.length] = "--frontend";
    cmd_options[cmd_options.length] = input;
    cmd_options[cmd_options.length] = "-o";
    cmd_options[cmd_options.length] = output;
    //disable subtitles, since embeded subtitles can cause problems
    cmd_options[cmd_options.length] = "--nosubtitles";

    //presets
    if (options.preset) {
      cmd_options[cmd_options.length] = "--preset";
      cmd_options[cmd_options.length] = String(options.preset);
    }

    //video
    if (options.width && parseInt(options.width) > 0) {
      cmd_options[cmd_options.length] = "--width";
      cmd_options[cmd_options.length] = String(options.width);
    }
    if (options.height && parseInt(options.height) > 0) {
      cmd_options[cmd_options.length] = "--height";
      cmd_options[cmd_options.length] = String(options.height);
    }
    if (options.maxSize && parseInt(options.maxSize) > 0) {
      cmd_options[cmd_options.length] = "--max_size";
      cmd_options[cmd_options.length] = String(options.maxSize);
    }
    if (options.noUpscaling) {
      cmd_options[cmd_options.length] = "--no-upscaling";
    }
    if (options.videoQuality >= 0) {
      cmd_options[cmd_options.length] = "-v";
      cmd_options[cmd_options.length] = String(options.videoQuality);
    }
    if (options.videoBitrate) {
      cmd_options[cmd_options.length] = "-V";
      cmd_options[cmd_options.length] = String(options.videoBitrate);
    }
    if (options.twopass) {
      cmd_options[cmd_options.length] = "--two-pass";
    }
    if (options.framerate) {
      cmd_options[cmd_options.length] = "-F";
      cmd_options[cmd_options.length] = String(options.framerate);
    }
    if (options.aspect) {
      cmd_options[cmd_options.length] = "--aspect";
      cmd_options[cmd_options.length] = String(options.aspect);
    }
    if (options.starttime) {
      cmd_options[cmd_options.length] = "--starttime";
      cmd_options[cmd_options.length] = String(options.starttime);
    }
    if (options.endtime) {
      cmd_options[cmd_options.length] = "--endtime";
      cmd_options[cmd_options.length] = String(options.endtime);
    }
    if (options.cropTop) {
      cmd_options[cmd_options.length] = "--croptop";
      cmd_options[cmd_options.length] = String(options.cropTop);
    }
    if (options.cropBottom) {
      cmd_options[cmd_options.length] = "--cropbottom";
      cmd_options[cmd_options.length] = String(options.cropBottom);
    }
    if (options.cropLeft) {
      cmd_options[cmd_options.length] = "--cropleft";
      cmd_options[cmd_options.length] = String(options.cropLeft);
    }
    if (options.cropRight) {
      cmd_options[cmd_options.length] = "--cropright";
      cmd_options[cmd_options.length] = String(options.cropRight);
    }
    if (options.keyframeInterval) {
      cmd_options[cmd_options.length] = "--keyint";
      cmd_options[cmd_options.length] = String(options.keyframeInterval);
    }
    if (options.denoise) {
      cmd_options[cmd_options.length] = "--pp";
      cmd_options[cmd_options.length] = "de";
    }
    if (options.bufferDelay) {
      cmd_options[cmd_options.length] = "--buf-delay";
      cmd_options[cmd_options.length] = String(options.bufferDelay);
    }
    if (options.softTarget) {
      cmd_options[cmd_options.length] = "--soft-target";
    }
    if (options.deinterlace) {
      cmd_options[cmd_options.length] = "--deinterlace";
    }
    if (options.brightness) {
      cmd_options[cmd_options.length] = "--brightness";
      cmd_options[cmd_options.length] = String(options.brightness);
    }
    if (options.contrast) {
      cmd_options[cmd_options.length] = "--contrast";
      cmd_options[cmd_options.length] = String(options.contrast);
    }
    if (options.gamma) {
      cmd_options[cmd_options.length] = "--gamma";
      cmd_options[cmd_options.length] = String(options.gamma);
    }
    if (options.saturation) {
      cmd_options[cmd_options.length] = "--saturation";
      cmd_options[cmd_options.length] = String(options.saturation);
    }
    if (options.postprocessing) {
      cmd_options[cmd_options.length] = "--pp";
      cmd_options[cmd_options.length] = String(options.pp);
    }
    if (options.novideo) {
      cmd_options[cmd_options.length] = "--novideo";
      cmd_options[cmd_options.length] = "--no-skeleton";
    }

    //audio
    if (options.audioQuality) {
      cmd_options[cmd_options.length] = "-a";
      cmd_options[cmd_options.length] = String(options.audioQuality);
    }
    if (options.audioBitrate) {
      cmd_options[cmd_options.length] = "-A";
      cmd_options[cmd_options.length] = String(options.audioBitrate);
    }
    if (options.samplerate) {
      cmd_options[cmd_options.length] = "-H";
      cmd_options[cmd_options.length] = String(options.samplerate);
    }
    if (options.channels) {
      cmd_options[cmd_options.length] = "-c";
      cmd_options[cmd_options.length] = String(options.channels);
    }
    if (options.noaudio) {
      cmd_options[cmd_options.length] = "--noaudio";
    }

    //metadata
    if (options.artist) {
      cmd_options[cmd_options.length] = "--artist";
      cmd_options[cmd_options.length] = String(options.artist);
    }
    if (options.title) {
      cmd_options[cmd_options.length] = "--title";
      cmd_options[cmd_options.length] = String(options.title);
    }
    if (options.date) {
      cmd_options[cmd_options.length] = "--date";
      cmd_options[cmd_options.length] = String(options.date);
    }
    if (options.location) {
      cmd_options[cmd_options.length] = "--location";
      cmd_options[cmd_options.length] = String(options.location);
    }
    if (options.organization) {
      cmd_options[cmd_options.length] = "--organization";
      cmd_options[cmd_options.length] = String(options.organization);
    }
    if (options.copyright) {
      cmd_options[cmd_options.length] = "--copyright";
      cmd_options[cmd_options.length] = String(options.copyright);
    }
    if (options.license) {
      cmd_options[cmd_options.length] = "--license";
      cmd_options[cmd_options.length] = String(options.license);
    }
    if (options.contact) {
      cmd_options[cmd_options.length] = "--contact";
      cmd_options[cmd_options.length] = String(options.contact);
    }

    return cmd_options;
  },
}
ffenc._init();

function FirefoggEncoder(input, output, options, done_cb, progress_cb) {
  var _this = this;
  this.input = input;
  this.output = output;
  this.options = options;

  this.done_cb = function (data) {
    _this.done = true;
    done_cb(data);
  }
  this.progress_cb = progress_cb;
  this.process = null;
  this.done = false;

  this.info = ffenc.info(this.input);
  this.status = {};
  if (this.options.videoCodec == 'vp9') {
    this.options.twopass = true;
  }

  var webm = this.options.videoCodec == 'vp8' || this.options.videoCodec == 'vp9' || this.output.substr(-4) == 'webm';
  if (webm) {
    var command = ffenc.bin('ffmpeg');
    if (this.options.twopass) {
      var pass = 1;
      var options = ffenc.ffmpeg_options(this.input, this.output, this.options, this.info, 1);
      var progress_cb = function(pass) {
        return function(data) {
          var info = _this.parse_ffmpeg(data, pass);
          _this.progress_cb(info);
        }
      }
      this.process = ffenc.subprocess(command, options, function(data) {
        if(data.status == 'ok') {
          var pass = 2;
          var options = ffenc.ffmpeg_options(_this.input, _this.output,
                                             _this.options, _this.info, pass);
          _this.done = false;
          _this.process = ffenc.subprocess(command, options,
            function(data) {
              var file = Cc["@mozilla.org/file/local;1"].createInstance(Ci.nsIFile);
              file.initWithPath(_this.output + '.log-0.log');
              if(file.exists()) {
                try {
                  file.remove(false);
                } catch(e) {
                  utils.debug("failed to remove temporary file");
                }
              }
              _this.done_cb(data);
            }, progress_cb(pass));
        } else {
          //dump('pass 1 failed\n');
          data.error = 'pass 1 failed.';
          _this.done_cb(data);
        }
      }, progress_cb(pass));
    } else {
      var pass = 0;
      var options = ffenc.ffmpeg_options(this.input, this.output,
                                         this.options, this.info);
      this.process = ffenc.subprocess(command, options, this.done_cb, function(data) {
          var info = _this.parse_ffmpeg(data, pass);
          _this.progress_cb(info);
      });
    }
  } else { //Ogg Theora
    var command = ffenc.bin('ffmpeg2theora');
    var options = ffenc.ffmpeg2theora_options(this.input, this.output,
                                              this.options, this.info);
    this.process = ffenc.subprocess(command, options, this.done_cb, function(data) {
        var info = _this.parse_ffmpeg2theora(data);
        _this.progress_cb(info);
    });
  }
}
FirefoggEncoder.prototype = {
  cancel: function() {
    if(!this.done) {
      if (this.process) {
        this.process.kill();
        if(!this.done) {
          utils.removeFiles(this.output);
        }
      }
      this.process = null;
    }
  },
  parse_ffmpeg2theora: function(data) {
    var _this = this;
    var _data = data.replace(/^\s+|\s+$/g,"").replace(/\r/g, '\n').split('\n'); // strip and split at newlines
    _data = _data[_data.length-1];                     // look at last line
    try {
      var _info = JSON.parse(_data);
    } catch(e) {
      var _info = {};
    }
    if (_info.position && _info.duration)
      _info.progress = parseFloat(_info.position) / parseFloat(_info.duration);
    
    ['duration', 'position', 'progress'].forEach(function(key) {
      if(_info[key])
        _this.status[key] = _info[key];
    });
    return this.status;
  },
  parse_ffmpeg: function(_data, pass) {
    var _this = this;
    var _info = {};
    //dump('ffmpeg:'+_data + '\n');
    _data = _data.trim().split('\n');
    _data.forEach(function(value) {
      var kv = value.split('=');
      if(kv.length == 2) {
        _info[kv[0].trim()] = kv[1].trim();
      } else {
        //utils.debug('!! ' + value);
      }
    });
    //utils.debug('ffmpeg info: '+ JSON.stringify(_info));
    if (this.options.framerate) {
      var _enc_framerate = this.options.framerate;
    } else {
      var _enc_framerate = this.info.video[0].framerate;
    }
    var _f = _enc_framerate.split(':');
    if(_f.length == 2)
      _enc_framerate = parseInt(_f[0]) / parseInt(_f[1]);
    else
      _enc_framerate = parseFloat(_enc_framerate);

    _info.duration = this.info.duration;

    if(_info.frame)
      _info.position = parseInt(_info.frame) / _enc_framerate;

    if (_info.position && _info.duration) {
      _info.progress = parseFloat(_info.position) / _info.duration;
      if(pass==1)
        _info.progress = _info.progress/2;
      else if(pass==2)
        _info.progress = 0.5 + _info.progress/2;
      if (_info.progress >= 1) {
        _info.progress = 0.99999;
      }
    }
    ['duration', 'position', 'progress'].forEach(function(key) {
      if(_info[key])
        _this.status[key] = _info[key];
    });
    /*
    for(key in _info) {
      dump(key + '->'+_info[key] + '\n');
    }
    */
    return this.status;
  }
}

