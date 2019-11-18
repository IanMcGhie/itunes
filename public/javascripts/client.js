"use strict";

var state = {};
var playList = [];
var websocketPort = 6502;

$(document).ready(function() {
    setupVolumeSlider();
    setupWebsocket();
    setupProgressBar();
    setupClickListeners();
    setupBodyKeyboardEvents();
}); // $(document).ready( function() {

String.prototype.toMMSS = function() {
    var sec_num = parseInt(this, 10); // don't forget the second param
    var hours = Math.floor(sec_num / 3600);
    var minutes = Math.floor((sec_num - (hours * 3600)) / 60);
    var seconds = sec_num - (hours * 3600) - (minutes * 60);

    if (hours < 10) {
        hours = "0" + hours;
    }
    if (minutes < 10) {
        minutes = "0" + minutes;
    }
    if (seconds < 10) {
        seconds = "0" + seconds;
    }

    return minutes + ":" + seconds; // + hours;
} // String.prototype.toMMSS = function () {

function getSongTitle(_index) { // //.replace(/^[a-z]\/|.mp3$/gmi, "");
    // remove dir/ from front of still...playlist array includes mp3 a,b,c,d.. dirs
    // and the .mp3 at the end
    var result = playList[_index].replace(/^\/[a-z]\//gmi, "");
    result = result.replace(/\.mp3$/gmi, "");
    return result;
}

function getSongIndex(_song) {
    for (var i=0; i < playList.length; i++) 
        if (getSongTitle(i) == _song)
            return i;
}

// return index of song in mp3search textbox
function getSongSelectedIndex() {
    return getSongIndex($("#mp3search").val());
}

function getVolume() {
    return parseInt($("#volume").slider("value"))
}

function setupProgressBar() {
    setInterval(function() {
        var margin = 0;

        if (!state.paused) {
            state.timeremaining--;

            $("#timeremaining").text('-' + state.timeremaining.toString().toMMSS());

            if ((state.timeremaining / state.duration) > 0)
                margin = 140 - (state.timeremaining / state.duration) * 375;

            $("#progressbar").css("left", margin);
        } // if (!state.paused) {
    }, 1000);
} // function setupProgressBar(){

function setupVolumeSlider() {
    $("#volume").slider({
        animate: true,
        min: 0,
        max: 100,
        value: state.volume
    });

    $("#volume").on("slidechange", function(_event, _ui) {
        if (getVolume() != state.volume)
            $.get("setvolume/" + getVolume());
    }); // $("#volume").on("slidechange", function( _event, _ui )  {

    $("#winamp,#timeremaining,#pause,#prev,#next,#shuffle").on("wheel", function(_event) {
        if (_event.originalEvent.deltaY < 0)
            state.volume++;
        else
            state.volume--;

        $.get("setvolume/" + state.volume);
    }) // $("#winamp,#volume,#timeremaining,#pause,#prev,#next,#shuffle").on("wheel", function(_event) {
} // function setupVolumeSlider() {

function setupClickListeners() {
    $("#pause,#prev,#next,#shuffle").click(function() {
        $.get((this).id)
    });

    $("#queuesong,#playsong").click(function() {
         $.get((this).id + "/" + getSongIndex($("#mp3search").val()));
    });

    $("#playlist").click(function() {
        $("#mp3search").val($("#playlist").find("option:selected").val());
    });
    
} // function setupClickListeners() {

function setupPlayListKeyboardEvents() {
    $("#playlist").focusin(function() {
        $("body").unbind("keyup");
        $("#playlist").css("border", "2px solid #5f5");

        $("#playlist").keyup(function(_event) {
            console.log("key down -> " + _event.which);

            switch (_event.which) {
                case 13:
                    $.get("playsong/" + $("#playlist").find("option:selected").index);
                    break;
                
                case 51: // 3
                    if (_event.altKey) {
                        console.log("Hey! alt-3 event captured!");
                        event.preventDefault();
                    }
                    break;
            }; // switch (_event.which) {
        }); // $("#playlist").keyup(function(_event){
    }); // $("#playlist").focusin(function() {

    $("#playlist").focusout(function() {
        $("#mp3search,#playlist").unbind("keyup");
        $("#playlist").css("border", "1px solid #0f0");
        setupBodyKeyboardEvents();
    });
} // function setupPlayListKeyboardEvents(){

function setupBodyKeyboardEvents() {
    $("body").keyup(function(_event) {
        console.log("keyboard event -> " + _event.which)

        switch (_event.which) {
            case 40: // cr down
            case 38: // cr up
                $("#mp3search").val(getSongTitle(state.currentlyplaying));
            break

            case 66: // b
                $.get("next");
                break;

            case 79: // o
                $.get("setvolume/" + (state.volume + 1));
                break;

            case 73: // i
                $.get("setvolume/" + (state.volume - 1));
                break;

            case 74: // j
                $("#mp3search").focus();
                break;

            case 67: // c
                $.get("pause");
                break;

            case 90: // z
                $.get("prev");
                break;

            case 83: // s
                $.get("shuffle");
                break;

            case 81: // q
                $.get("queuesong/" + getSongSelectedIndex());
                break;

            case 13:
                $.get("playsong/" + getSongSelectedIndex());
                break;
        } // switch (_event.which) {
    }); // $("body").keyup(function(_event) {
} // function bodyKeyboardEvents(_event) {

function parseJsonPlaylist() {
    console.log("parsing playlist " + state.playlist.length + " entries");

    playList = state.playlist;
    setupSearchTextBox();

    // add playlist to select box
    for (var i = 0; i < playList.length; i++) {
        var select = document.getElementById("playlist");
        var option = document.createElement("option");

        option.setAttribute("id", i);
        option.text = getSongTitle(i);
        select.add(option);

        $("#" + i).dblclick(function() {
            $.get("playsong/" + (this).id)
        });
    } //   for (var i = 0;i < playList.length; i++) {
}

function queuePopup() {
    $("#dialog").css("display", "inline-block");
    $("#dialog").html(getSongTitle(state.queuesong) + " queued");
    $("#dialog").hide("drop", {
        direction: "down"
    }, 5000);
}

function parseState(_jsonData) {
    console.log("state received from server");

    state = JSON.parse(_jsonData);

    if (state.playlist.length > 0) 
        parseJsonPlaylist();
    else 
        console.dir(state); 

    if (state.hasOwnProperty('queuesong'))
        queuePopup();

    if (state.shuffle)
        $("#shuffleenabled").css("visibility", "visible");
    else
        $("#shuffleenabled").css("visibility", "hidden");
    
    $("#volume").slider("value", state.volume);
    $("#playlist>option:eq(" + state.currentlyplaying + ")").prop('selected', true);
    $("#songtitle,#title").text(getSongTitle(state.currentlyplaying));
    $("#mp3search").val(getSongTitle(state.currentlyplaying));
}

function setupWebsocket() {
    var serverUrl = "ws://" + document.location.hostname + ":" + websocketPort;
    var client = new WebSocket(serverUrl, "json");

    client.onopen = function(_event) {
        console.log("onopen()");
    };

    client.onmessage = function(_event) {
        parseState(_event.data);
    };

    client.onclose = function(_event) {
        console.log("onclose()");
    };
} // function setupWebsocket() {

function charsAllowed(_value) {
    var allowedChars = new RegExp(/^[a-zA-Z\s]+$/);

    return allowedChars.test(_value);
}

function setupSearchTextBox() {
    var items = playList.map(function(n) {
    var result = n.replace(/^\/[a-z]\//gmi, "");
    result = result.replace(/\.mp3$/gmi, "");

        return {
            label: result,
            group: "Results"
        }
    });

    $("#mp3search").focusin(function() {
        $("#mp3search").css("border", "2px solid #5f5");
        $("body").unbind("keyup");
        $("#mp3search").val("");

        $("#mp3search").keyup(function(_event) {
            switch(_event.which) {
                case 13:
                    $.get("playsong/" + getSongSelectedIndex());
                break;

                case 27: // esc key
                    $("#mp3search").blur();
                break;
            } // switch(_event.which) {
        });
    }); // $("#mp3search").focusin(function(){

    $("#mp3search").focusout(function() {
        $("#mp3search").css("border", "1px solid #0f0");
        $("#mp3search").unbind("keyup");
        $("#mp3search").val($("#playlist").val());
        setupBodyKeyboardEvents();
    });

    autocomplete({
        preventSubmit: true,
        input: document.getElementById('mp3search'),
        minLength: 2,
        onSelect: function(item, inputfield) {
//            inputfield.value = item.label;
            console.log("onselect ****")
            $("#mp3search").val(item.label);

        },

        fetch: function(text, callback) {
            var match = text.toLowerCase();
            callback(items.filter(function(n) {
                console.log("onfetch ****")
                if (n.label)
                    return n.label.toLowerCase().indexOf(match) !== -1;
            }));
        },

        render: function(item, value) {
            var itemElement = document.createElement("div");
            itemElement.id = "row";
            itemElement.setAttribute("style", "text-align: left");
            console.log("onrender ****")

            if (charsAllowed(value)) {
                var regex = new RegExp(value, 'gi');
                var inner = item.label.replace(regex, function(_match) {
                    return "<strong>" + _match + "</strong>"
                });

                itemElement.innerHTML = inner;
            } else {
                itemElement.textContent = item.label;
            }

            return itemElement;
        },

        emptyMsg: "MP3 not found",
        customize: function(_input, _inputRect, _container, _maxHeight) {

            if (_maxHeight < 100) {
                _container.style.top = "";
                _container.style.bottom = (window.innerHeight - _inputRect.bottom + _input.offsetHeight) + "px";
                _container.style.maxHeight = "140px";
            } // if (maxHeight < 100) {
        } // customize: function(input, inputRect, container, maxHeight) {
    }) // autocomplete({
} // function mp3SearchSetup() {