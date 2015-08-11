translations = {};
function _(str) {
//    translations[str] = '';
    return str;
}
presets = {
    '1080p': {
        'description': '1080p (6Mbit connection)',
        'maxSize': '1920x1080',
        'noUpscaling': true,
        'videoQuality': 8,
        'audioQuality': 7
    },
    '720p': {
        'description': '720p (4Mbit connection)',
        'maxSize': '1280x720',
        'noUpscaling': true,
        'videoQuality': 6,
        'audioQuality': 6
    },
    '480p': {
        'description': '480p (2Mbit connection)',
        'maxSize': '854x480',
        'noUpscaling': true,
        'videoBitrate': 1024,
        'audioQuality': 3,
        'softTarget': true
    },
    '360p': {
        'description': '360p (1Mbit connection)',
        'maxSize': '640x360',
        'noUpscaling': true,
        'videoBitrate': 512,
        'audioQuality': 2,
        'twopass': true,
        'softTarget': true
    },
    '160p': {
        'description': '160p (512kbit connection)',
        'maxSize': '266x160',
        'noUpscaling': true,
        'videoBitrate': 192,
        'framerate': "15",
        'audioQuality': -1,
        'twopass': true,
        'softTarget': true
    }
};
function serializeOptions() {
    var options = {},
        preset = $('#preset').val();
    
    if($('.active').attr('id') == 'audioOptions') {
        $.map($('#audioForm').serializeArray(), function(n, i){
            if(n.value) {
                options[n.name] = n.value=='on'?true:n.value;
            }
            options.audioQuality = $('.audioQualityValue')[0].innerHTML;
            options.novideo = true;
        });

    }
    else if(preset == 'custom') {
        $.map($('#videoOptions').serializeArray(), function(n, i){
            if(n.value) {
                options[n.name] = n.value=='on'?true:n.value;
            }
        });
        if(!options.video) {
            delete options.videoCodec;
            options.novideo = true;
        }
        if(!options.audio) {
            delete options.channels;
            delete options.samplerate;
            delete options.audioQuality;
            options.noaudio = true;
        } else {
            options.audioQuality = $('.audioQualityValue')[0].innerHTML;
        }
        if(!options.metadata || options.videoCodec == 'vp8' || options.videoCodec == 'vp9') {
            delete options.title;
            delete options.artist;
            delete options.date;
            delete options.location;
            delete options.organization;
            delete options.copyright;
            delete options.license;
            delete options.contact;
        }
        delete options.audio;
        delete options.video;
        delete options.metadata;

    } else {
        options = presets[preset];
        var format = $('#format').val();
        if (format == 'vp9') {
            options.videoCodec = 'vp9';
            options.audioCodec = 'opus';
        } else if (format == 'vp8') {
            options.videoCodec = 'vp8';
            options.audioCodec = 'vorbis';
        } else {
            options.videoCodec = 'theora';
            options.audioCodec = 'vorbis';
        }
    }
    options.audioCodec = options.videoCodec == 'vp9' ? 'opus': 'vorbis';
    return options;
}
function formatDuration(sec) {
    var pad = [2, 2, 2];
    return [
            Math.floor(sec % 86400 / 3600),
            Math.floor(sec % 3600 / 60),
            (sec % 60).toFixed()
    ].map(function(v, i) {
        v = v.toString();
        while(v.length<pad[i]) {
            v = '0' + v;
        }
        return v;
    }).join(':');
}
function formatBytes(bytes) {
    var base = 1024,
        PREFIXES = ['K', 'M', 'G', 'T', 'P'],
        len = PREFIXES.length,
        val,
        pow = 1;
    while(Math.pow(base, pow+1) < bytes) {
        pow += 1;
    }
    return Math.round(bytes / Math.pow(base, pow)) + ' ' + PREFIXES[pow-1] + 'B';
}
function formatInfo(info) {
    var html = '';
    html += '<b>' + info.path + '</b>';
    html += '<br />';
    if(info.video && info.video.length>0) {
        var video = info.video[0];
        html += video.width + 'x' + video.height  + ' (' + video.codec + ')';
    }
    if(info.video && info.video.length>0 && info.audio && info.audio.length>0) {
        html += ' / ';
    }
    if(info.audio && info.audio.length>0) {
        var audio= info.audio[0];
        html += '' + {
            1: _('mono'),
            2: _('stereo'),
            6: '5.1'
        }[audio.channels];
        html += ' ' + audio.samplerate/1000 + ' kHz ';
        html += '(' + audio.codec + ')';
    }
    html += '<br />';
    html += '' + formatBytes(info.size);
    html += ' / ' + formatDuration(info.duration);

    return html; 
}



function step(current) {
    $('#overview .step').removeClass('current');
    $('#overview .marker').removeClass('current');
    $('#step'+current).addClass('current');
    $('#overview .step').each(function() {
        if(parseInt(this.id.substr(4), 10) < current) {
            $(this).addClass('done');
        } else {
            $(this).removeClass('done');
        }
    });
    if(current<4) {
        $('#step'+current).next().addClass('current');
    }
    if(current == 1) {
        $('h1').show();
    } else {
        $('h1').hide();
    }
}
function buttons(btns) {
    $('#buttons input').hide();
    $('#buttons').show();
    btns.forEach(function(button) {
        $('#'+button+'Button').show();
    });
}
function card(c) {
    $('.card').removeClass('active');
    $('#'+c).addClass('active');
    buttons({
        'select': ['select'],
        'options': ['advanced', 'encode'],
        'audioOptions': ['encode'],
        'advancedOptions': ['simple', 'encode'],
        'encoding': ['cancel'],
        'result': ['again'],
    }[c]);
    step({
        'select': 1,
        'options': 2,
        'audioOptions': 2,
        'advancedOptions': 2,
        'encoding': 3,
        'result': 4,
    }[c]);
}
function updateAudioQuality(value) {
   $('.audioQualityValue').html(parseFloat(value).toFixed(1));
}

//main
$(function() {
    if(typeof(Firefogg) != 'undefined' && Firefogg().version >= "2.6.11") {
    } else {
        $('#warning').show();
        return;
    }
    if(document.location.hash == '#debug') {
        $('#debug').show();
    }

    if (!document.createElement('video').canPlayType('video/webm; codecs=vp9,opus')) {
        $('.vp9').remove();
    }

    //load translations
    $('.step').each(function() {
        $(this).html(_($(this).html()));
    });
    $('.txt').each(function() {
        $(this).html(_($(this).html()));
    });
    $('option').each(function() {
        $(this).html(_($(this).html()));
    });
    $.each(presets, function(k, v) {
        $('#preset').append($('<option>').html(_(v.description)).attr('value', k));
        delete v.description;
    });
    $('#preset').append($('<option>').html(_('Custom')).attr('value', 'custom'));
    ogg = new Firefogg();
    updateAudioQuality($('#audioForm')[0].audioQuality.value);
    card('select');
    $('#selectButton').click(function() {
        $('#selectButton').attr('disabled', true);
        if(ogg.selectVideo()) {
            var info = JSON.parse(ogg.sourceInfo),
                formatedInfo = formatInfo(info);
            $('#info').html(formatedInfo);
            $('#audioInfo').html(formatedInfo);
            $('#advancedInfo').html(formatedInfo);
            $('#selectButton').attr('disabled', false);
            if(info.video && info.video.length>0) {
                var height = info.video[0].height,
                    resolutions = $.map(presets, function(v, k) {
                                        return parseInt(k.substring(0, k.length-1), 10);}),
                    p = 0;
                while(resolutions[p+1] >= height && resolutions.length+1>p) {
                    p += 1;
                }
                $('#preset').val(resolutions[p] + 'p');
                $('#options').addClass("active");
                card('options');
            } else if(info.audio && info.audio.length>0) {
                card('audioOptions');
            } else {
                alert(_('no media detected, can not convert that file'));
                return;
            }
        } else {
            $('#selectButton').attr('disabled', false);
        }
    });
    $('#advancedButton').click(function() {
        $('#preset').val('custom').trigger('change');
    });
    $('#simpleButton').click(function() {
        card('options');
    });
    $('#encodeButton').click(function() {
        var options = serializeOptions(),
            started = new Date();
        if (options.videoCodec == 'vp9' || options.videoCodec == 'vp8') {
            ogg.setFormat('webm');
        } else {
            ogg.setFormat('ogg');
        }
        //check options are valid
        if(options.twopass && !options.videoBitrate) {
            alert('You have to set a video bitrate in to use 2 pass encoding');
            return;
        }
        if(ogg.saveVideoAs()) {
            ogg.encode(JSON.stringify(options),
                       function(data, video) { //callback
                           $('#debug').html(data);
                           data = JSON.parse(data);
                           if(data.progress == 1) {
                               $('#resultPreview').attr({
                                   src: data.preview
                               });
                               $('#resultFailed').hide();
                           } else {
                               $('#resultOk').hide();
                           }
                           card('result');
                       },
                       function(data) { //progress
                           $('#debug').html(data);
                           data = JSON.parse(data);
                           if(data.progress>0) {
                               $('#encodingProgress').attr('value', data.progress);
                               $('#percent').html((data.progress*100).toFixed(2));
                               var elapsed = (new Date() - started) / 1000;
                               var eta = elapsed / data.progress - elapsed;
                               $('#eta').html(_('Estimated time remaining') +
                                               ' ' + formatDuration(eta));
                           }
                       }
            );
            card('encoding');
        }
    });

    function updateOptions(codec) {
        if(codec == 'vp8' || codec == 'vp9') {
            $('.theoraOption').hide();
            $('.vp8Option').show();
        } else {
            $('.vp8Option').hide();
            $('.theoraOption').show();
        }
        if(codec == 'vp9') {
            $('#samplerate').val(48000).attr('disabled', true);
            $('#twopass').attr({
                checked: true,
                disabled: true
            });
        } else {
            $('#samplerate').attr('disabled', false);
            $('#twopass').attr('disabled', false);
        }
    }
    updateOptions($('#videoCodec').val());
    $('#videoCodec').change(function() {
        updateOptions(this.value);
    });
    $('#twopass').change(function() {
        if(this.checked) {
            var vb = $('#videoBitrate');
            if(!vb.val()) {
                vb.val('1000');
            }
        }
    });
    $('#enableVideo,#enableAudio,#enableMetadata').click(function() {
        var section = this.id.substring(6, this.id.length).toLowerCase();
        if(this.checked) {
            $('#'+section+'Settings').show();
            $('#'+section+'Disabled').hide();
        } else {
            $('#'+section+'Settings').hide();
            $('#'+section+'Disabled').show();
        }
    });
    $('#preset').change(function() {
        if(this.value == 'custom') {
            card('advancedOptions');
        }
    });
    $('#cancelButton').click(function() {
        if(confirm(_("Are you sure you want to stop the encoding?"))) {
            ogg.cancel();
            card('select');
        }
    });
    $('#againButton').click(function() {
        $('#encodingProgress').attr('value', 0);
        $('#percent').html('0');
        $('#eta').html('');
       $('#resultPreview').attr('src', '');
        card('select');
    });
});
