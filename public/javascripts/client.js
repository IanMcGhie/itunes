"use strict";
var state = { setVolume: false};
var playList = [];
var websocketPort = 6502;
var searchDropdownVisible = true;
var isFirefox;

$(document).ready(function() {
    isFirefox = typeof InstallTrigger !== 'undefined';
  
    setupTimer();
    setupKBEvents();
    setupClickListeners();
    setupSearchKBEvents();
    setupPlayListKBEvents();
    setupVolumeControl();

    if (!isFirefox)
        getBBState();
            else
                setupWebsocket();            
}); // $(document).ready(() => {

String.prototype.toMMSS = function() {
    var sec_num = parseInt(this, 10); // don't forget the second param
    var hours   = Math.floor(sec_num / 3600);
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

function getBBState() {
    $("#playlist").css("width","400px");
    
    $.getJSON("getbbstate", function( _stateJson ) {
        state = _stateJson;
        playList = state.playList;

        populateSelectBox();
        setupSearchAutoComplete();
        updateUI();
        
        $("#volume").slider({ value: state.volume });
    });    
}

function getSongTitle(_index) { 
    // /a/ACDC/AC DC - 74 Jailbreak/01 - Jailbreak.mp3
    // remove dir/ from front of string &
    var result = playList[_index].replace(/^\/[a-z]\//i, "");

    return result.replace(/\.mp3$/i, ""); // and the .mp3 at the end
}

// return playList array index of song in #mp3search textbox
function getSongSelectedIndex() {
    for (var i = 0; i < playList.length; i++) 
        if (getSongTitle(i) == $("#mp3search").val())
            return i;

    return -1;
}

// timer for progress bar & song duration display
function setupTimer() {
    setInterval(function() {
        if (!state.paused ) {
            var margin = 0;

            state.timeremaining--;

            if ((state.timeremaining / state.duration) > 0)
                margin = 140 - (state.timeremaining / state.duration) * 375;

            $("#progressbar").css("left", margin);
            $("#timeremaining").text('-' + state.timeremaining.toString().toMMSS());
        } // if (!state.paused) {
    }, 1000);
} // function setupTimer(){

function setupVolumeControl() {
    $("#volume").slider({
        animate: false,
        min: 0,
        max: 100,
        value: state.volume
    });

    $("#volume").on("slidechange", function(_event, _ui) {
        //console.log("volume slidechange state.setVolume -> " + Object.keys(state.setVolume))
        
        if (state.volume != $("#volume").slider("value")){
            //alert("volume -> " + $("#volume").slider("value"));
            $.get("setvolume/" + $("#volume").slider("value"));
        }
    }); // $("#volume").on("slidechange", (_event, _ui) => {

    $("#player,#prev,#pause,#next").on("wheel", function(_event) {
        if (_event.originalEvent.deltaY < 0)
            state.volume++;
                else
                    if (state.volume > 0)
                        state.volume--;

        $.get("setvolume/" + state.volume);
        $("#volume").slider("value", state.volume);
    }) // $("#winamp,#volume,#timeremaining,#pause,#prev,#next,#shuffle").on("wheel", function(_event) {
} // function setupVolumeControl() {
 
function setupClickListeners() {
    if (!isFirefox) 
        $("#winamp").click(function() {
        location.reload();
    });

    $("#pause,#prev,#next,#shuffle").click(function() { 
         $.get((this).id);
     });

    $("#queuesong,#playsong").click(function() {
        $.get((this).id + "/" + getSongSelectedIndex());
    });
    
    $("#playlist").dblclick(function() {
        $.get("playsong/" + $("#playlist").find("option:selected").index())
    });

    $("#playlist").click(function() {
        $("#mp3search").val($("#playlist").find("option:selected").val());
    });

    $("#listen").on("click", function(){
        window.open("http://crcw.mb.ca:8000/winamp.m3u");
    });
} // function setupClickListeners() {

function setupPlayListKBEvents() {
    $("#playlist").focusin(function () {
        $("body").off("keyup");
        $("#playlist").css("border", "2px solid #5f5");

        $("#playlist").keyup(function (_event)  {
            console.log("key up -> " + _event.which);

            switch (_event.which) {
                case 13:
                    $.get("playsong/" + getSongSelectedIndex());
                break;
                
                case 51: // 3
                    if (_event.altKey) {
                        console.log("Hey! alt-3 event captured!");
                        event.preventDefault();
                    }
                break;
            }; // switch (_event.which) {
        }); // $("#playlist").keyup((_event) => {
    }); // $("#playlist").focusin(() => {

    $("#playlist").focusout(function() {
        $("#playlist").off("keyup");
        $("#playlist").css("border", "1px solid #0f0");
        setupKBEvents();
    });
} // function setupPlayListKBEvents(){

function setupKBEvents() {
    $("body").keyup(function(_event) {
          switch (_event.which) {
            case 66: // b
                $.get("next");
            break;

            case 79: // o
                state.volume++;
                $.get("setvolume/" + state.volume);
                updateUI();
            break;

            case 73: // i
                state.volume--;
                $.get("setvolume/" + state.volume);
                updateUI();
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
                $.get("queueSong/" + getSongSelectedIndex());
            break;
        } // switch (_event.which) {
    }); // $("body").keyup(function(_event) {
} // function bodyKBEvents(_event) {

function setupSearchKBEvents() {
    $("#mp3search").focusin(function() {
        $("#mp3search").css("border", "2px solid #5f5");
        $("body").off("keyup");
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
    }); // $("#mp3search").focusin(() => {

    $("#mp3search").focusout(function() {
        $("#mp3search").css("border", "1px solid #0f0");
        $("#mp3search").off("keyup");

searchDropdownVisible = false;
console.log("dropdown not visible")

        if (getSongSelectedIndex() == -1)
            $("#mp3search").val(getSongTitle(state.currentlyplaying));

        setupKBEvents();
    });
} // function setupSearchKBEvents() {

// display queue popup window
function queuePopup() {
    $("#dialog").css("display", "inline-block");
    $("#dialog").html(getSongTitle(state.queueSong) + " queued.");
    $("#dialog").hide("drop", {
        direction: "down"
    }, 5000);

    state.queuePopup = -1;
}

function updateUI() {
    $("#playlist>option:eq(" + state.currentlyplaying + ")").prop('selected', true);
    
    if (state.currentlyplaying ) {
        $("#songtitle").text(getSongTitle(state.currentlyplaying) + " (" + state.duration.toString().toMMSS() + ")");
        $("#title").text(getSongTitle(state.currentlyplaying));
    }

    $("#mp3search").val(getSongTitle(state.currentlyplaying));
    $("#volume").slider("value", state.volume);

    if (state.shuffle)
        $("#shuffleenabled").css("visibility", "visible");
            else
                $("#shuffleenabled").css("visibility", "hidden");    
} // function updateUI() {

function parseState(_jsonData) {
    console.log("state received from server");
    console.dir(state);
        
    state = JSON.parse(_jsonData);

    $("#volume").slider("value", state.volume);
    
    if (state.playList ) {
        console.log("parsing playlist " + state.playList.length + " entries");

        playList = state.playList;

        populateSelectBox();
        setupSearchAutoComplete();
        updateUI();
    }

    if (state.queueSong > -1)
        queuePopup();
}

function populateSelectBox() {
    // add playlist songs to select box
    for (var i = 0; i < playList.length; i++) {
        var select = document.getElementById("playlist");
        var option = document.createElement("option");

        option.setAttribute("id", i);
        option.text = getSongTitle(i);
        select.add(option);
    }
}

function setupWebsocket() {
    var serverUrl   = "ws://" + document.location.hostname + ":" + websocketPort;
    var client      = new WebSocket(serverUrl, "json");

    client.onopen   = function(_event) { 
        console.log("onopen()");
    };

    client.onmessage= function(_event) {
        console.log("onmessage()");
        parseState(_event.data); 
        updateUI();
    }

    client.onclose  = function(_event) { 
        console.log("onclose()");
    }
} 

function charsAllowed(_value) {
    var allowedChars = new RegExp(/^[a-zA-Z\s]+$/);

    return allowedChars.test(_value);
}

function setupSearchAutoComplete() {
    console.log("setupSearchAutoComplete()");

    autocomplete({
        preventSubmit: true,
        input: document.getElementById('mp3search'),
        minLength: 2,
        onSelect: function(_item, inputfield) {
            console.log("onselect ****");

            $("#mp3search").val(_item.label);
        },

        fetch: function(_text, _callback) {
            var match   = _text.toLowerCase();
            var items   = playList.map(function(_n) {
               var result  = _n.replace(/^\/[a-z]\//i, "");
               result      = result.replace(/\.mp3$/i, "");
            
                return {
                    label: result,
                    group: "Results"
                    }
                });

            _callback(items.filter(function(_n) {
                console.log("onfetch ****")
                
                if (_n.label)
                    return _n.label.toLowerCase().indexOf(match) !== -1;
            }));
            
        },

        render: function(_item, _value) {

            console.log("onrender ****")
            
searchDropdownVisible = true;
            var itemElement = document.createElement("div");
            itemElement.id = "row";
            itemElement.setAttribute("style", "text-align: left");
            
            if (charsAllowed(_value)) {
                var regex = new RegExp(_value, 'gi');
                var inner = _item.label.replace(regex, function(_match) {
                    return "<strong>" + _match + "</strong>"
                });

                itemElement.innerHTML = inner;
            } else {
                itemElement.textContent = _item.label;
            }
        
        $(itemElement).keyup(function(_event) {
            if (_event.which ==13) {
                console.log("keyup itemElement")
                $.get("playsong/" + getSongSelectedIndex());
                }
            })
 
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
} //  setupSearchAutoComplete() {
