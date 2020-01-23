"use strict";
var state = { volume: 0, timeRemaining: 0};
var playList = [];
var websocketPort = 6502;
var serverUrl   = "ws://winamp:" + websocketPort;
var isBlackBerry = false;
var resultrow = 0;

$(document).ready(function() {
    var isFirefox = typeof InstallTrigger !== 'undefined';
    var isChrome = !!window.chrome && (!!window.chrome.webstore || !!window.chrome.runtime);

    // prevent cr from sending form submit
    $(window).keydown(function(event) {
    if (event.keyCode == 13) {
        event.preventDefault();
        return false;
        }
    });    

    isBlackBerry = !isFirefox && !isChrome;

    if (isBlackBerry) {
        $("body").css("width","500px");
        $("#progressbar").css("display","absolute");
        $("#searchinput").css("width","300%");
        $("#winamp").css("margin-top","50px");
        
        getBBState("getbbplaylist"); // my blackberry foan
        getBBState("getbbstate");    // doesnt understand ajax....or newer js
        } else
            setupWebsocket();
            
    setupBodyKBEvents();
    setupSearch();
    setupPlayListKBEvents();
    setupMouseEvents();
    setupVolumeControl();
    setupTimer();
}); // $(document).ready(() => {

String.prototype.toMMSS = function() {
    var sec_num = parseInt(this, 10); // don't forget the second param
    var hours   = Math.floor(sec_num / 3600);
    var minutes = Math.floor((sec_num - (hours * 3600)) / 60);
    var seconds = sec_num - (hours * 3600) - (minutes * 60);

    if (minutes < 10) 
        minutes = "0" + minutes;
   
    if (seconds < 10)
        seconds = "0" + seconds;
  
    return minutes + ":" + seconds;
} // String.prototype.toMMSS = function () {

function getBBState(_getWhat) {
    switch (_getWhat) {
        case "getbbplaylist":
            $.getJSON(_getWhat, function(_state) {
                playList = _state;
                setupPlayList();
                setupSearchAutoComplete();
            });
        break;

        default: // get state
            setTimeout(function() {
                $.getJSON(_getWhat, function(_state) {
                    state = _state;
                    updateUI();
                });
            },400); // wait for xmms ro respond with new state
    } // switch (_getWhat) {
}

function getSongSelectedIndex() {
    return playList.indexOf($("#playlist").find("option:selected").val());
}

// timer for progress bar & song duration display
function setupTimer() {
    setInterval(function() {
        if (!state.paused) {
            state.timeRemaining++
            
            var margin = parseInt((state.timeRemaining / state.duration) * 375) - 225;

            $("#progressbar").css("left", margin);
            $("#timeremaining").text('-' + (state.duration - state.timeRemaining).toString().toMMSS());
        }
    }, 1000);
} // function setupTimer(){

function setupVolumeControl() {
    $("#volume").slider({
        animate: false,
        min: 0,
        max: 100,
        value: 0
    });

    $("#volume").on("slidechange", function(_event, _ui) {
        if (state.volume != $("#volume").slider("value")) {
            state.volume = $("#volume").slider("value")
            $.get("setvolume/" + state.volume);
        }
    }); // $("#volume").on("slidechange", (_event, _ui) => {

    // mouse wheel volume control
    $("#player,#prev,#pause,#next").on("wheel", function(_event) {
        if (_event.originalEvent.deltaY < 0)
            state.volume++;
                else
                   state.volume--;

        // set volume here...once
        // the server won't return a response here
        // so we dont set it over and over...
        $("#volume").slider("value",state.volume);
        $.get("setvolume/" + state.volume);
    }) // $("#winamp,#volume,#timeremaining,#pause,#prev,#next,#shuffle").on("wheel", function(_event) {
} // function setupVolumeControl() {
 
function setupMouseEvents() {
    $("#pause").on("click", function () {
        if (isBlackBerry)
            state.paused = !state.paused; // set pause here...too much latency from server req

        $.get((this).id);
    })

    $("#winamp").on("click", function () {
        if (isBlackBerry)
            getBBState("getbbstate");
    })

    $("#prev,#next,#shuffle,#timeremaining").click(function() { 
        if (isBlackBerry)
            getBBState("getbbstate");

        $.get((this).id); 
     });

    $("#queuesong").click(function() {
        var index = playList.indexOf($("#searchinput").val());

        if (isBlackBerry){
            state.queueSong = index;
            updateUI();
        }
    
        $.get((this).id + "/" + index); //this will return -1 if it cant find the song
    });

    $("#playsong").click(function() {
        if (playList.indexOf($("#searchinput").val()) >= 0) // if we can find the index for song
            $.get((this).id + "/" + playList.indexOf($("#searchinput").val())); //this will return -1 if it cant find the song
    });
    
    $("#playlist").dblclick(function() {
        $.get("playsong/" + $("#playlist").find("option:selected").index());
    });

    $("#playlist").change(function() {
        $("#searchinput").val($("#playlist").find("option:selected").val());
    });

    $("#listen").on("click", function() {
        window.open("http://crcw.mb.ca:8000/winamp.m3u");
    });
} // function setupMouseEvents() {

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
        
        setupBodyKBEvents();
    });
} // function setupPlayListKBEvents(){

function setupBodyKBEvents() {
    $("body").keyup(function(_event) {
          switch (_event.which) {
            case 90: // z
                $.get("prev");
                
                if (isBlackBerry) 
                        getBBState("getbbstate");
            break;

            case 66: // b
                $.get("next");

                if (isBlackBerry)
                        getBBState("getbbstate");
            break;

            case 79: // o
            case 73: // i
                if (_event.which == 79) 
                    state.volume++;
                        else
                            state.volume--;
                
                $.get("setvolume/" + state.volume, function(_response) {
                    updateUI();
                });
            break;

            case 74: // j
                $("#searchinput").focus();
            break;

            case 67: // c
                $.get("pause");
                state.paused = !state.paused;
            break;

            case 83: // s
                $.get("shuffle");

                if (isBlackBerry)
                    getBBState("getbbstate")
            break;

            case 81: // q
                $.get("queuesong/" + getSongSelectedIndex());
            break;
        } // switch (_event.which) {
    }); // $("body").keyup(function(_event) {
} // function bodyKBEvents(_event) {

function setupSearch() {
    $("#searchinput").focusin(function() {
        $("#searchinput").css("border", "2px solid #5f5");
        $("body").off("keyup");
        $("#searchinput").val("");

        $("#searchinput").keyup(function(_event) {
            switch(_event.which) {
                case 13:
                    $.get("playsong/" + playList.indexOf($("#searchinput").val()));
                    $("#playlist").focus();
                break;

                case 27: // esc key
                    $("#searchinput").blur();
                break;
            } // switch(_event.which) {
        }); // $("#searchinput").keyup(function(_event) {
    }); // $("#searchinput").focusin(() => {

    $("#searchinput").focusout(function() {
        var index = playList.indexOf($("#searchinput").val());
        
        $("#searchinput").css("border", "1px solid #0f0");
        $("#searchinput").off("keyup");

        if (index >= 0)
            $("#searchinput").val(playList[index]);
                else
                    $("#searchinput").val($("#playlist").find("option:selected").val());

        setupBodyKBEvents();
    }); // $("#searchinput").focusout(function() {
} // function setupSearch() {

function updateUI() {
    $("#title").text(playList[state.currentlyPlaying]);
    $("#songtitle").text(playList[state.currentlyPlaying] + " (" + parseInt(state.duration).toString().toMMSS() + ")");
    $("#searchinput").val(playList[state.currentlyPlaying]);

    if ($("#volume").slider("value") != state.volume)
        $("#volume").slider("value", state.volume);

    if (playList.length > 0)
        $("#playlist>option:eq(" + state.currentlyPlaying + ")").prop('selected', true);

    if (state.shuffle)
        $("#shuffleenabled").css("visibility", "visible");
            else
                $("#shuffleenabled").css("visibility", "hidden");

    if (state.queueSong >= 0) {
        if (isBlackBerry)
            $("#dialog").css("left", "0px");

        $("#dialog").css("display", "inline-block");
        $("#dialog").html(playList[state.queueSong] + " queued.");
        $("#dialog").hide("drop", { direction: "down" }, 5000);

        state.queueSong = -1;
    }
} // function updateUI() {

function setupPlayList() {
    // add playlist songs to select box
    for (var i = 0; i < playList.length; i++) {
        var select = document.getElementById("playlist");
        var option = document.createElement("option");

        option.setAttribute("id", i);
        option.text = playList[i];
        select.add(option);
    }
}

function setupWebsocket() {
    console.log("setting up websocket");

    var client = new WebSocket(serverUrl,"winamp");

    client.onmessage = function(_response) {
        var message  = JSON.parse(_response.data).msg;
        var jsonData = JSON.parse(_response.data).data;
        
        console.log("message received -> " + message);
        
        switch (message) {
            case "state":
                state =  jsonData;
                console.dir(state);
            break;

            case "playList":
                playList = JSON.parse(jsonData).playList;
                console.log("playlist received length -> " + playList.length);

                setupPlayList();
                setupSearchAutoComplete();
            break;
        }//switch (message) {
        
    updateUI();
    } //   client.onmessage = function(_response) {
} 

function charsAllowed(_value) {
    var allowedChars = new RegExp(/^[a-zA-Z\s]+$/);
    return allowedChars.test(_value);
}

function setupSearchAutoComplete() {
    console.log("setting up AutoComplete");
    var minLength = 2;

    if (isBlackBerry)
        minLength = 5;
    /*
    $("# ").change(function() {
        $("#searchinput").val($("#playlist").find("option:selected").val());
    });

$( "select" )
  .change(function() {
    var str = "";
    $( "select option:selected" ).each(function() {
      str += $( this ).text() + " ";
    });
    $( "div" ).text( str );
  })
  .trigger( "change" );
*/
    autocomplete({
        preventSubmit: true,
        input: document.getElementById('searchinput'),
        minLength: minLength,

        onSelect: function(_item, inputfield) {
            $("#searchinput").val(_item.label);
      //      console.log("onselect ****");
        },
        fetch: function(_match, _callback) {
            var match   = _match.toLowerCase();
            var items   = playList.map(function(_n) {
                return {
                    label: _n,
                    group: "Results"
                }
            });
        
            _callback(items.filter(function(_n) {
                 // console.log("onfetch ****")
                if (_n.label) 
                    return _n.label.toLowerCase().indexOf(match) !== -1;
            }));
        },
        render: function(_item, _value) {
          //  console.log("onrender ****")
//          console.dir(_item) $("#playlist").focusin(function () {
            var itemElement     = document.createElement("div");
            itemElement.id      = "resultrow_" + resultrow;
            resultrow++;

            $(itemElement.id).on("focus", function () {
                alert("hi");
            });

            if (charsAllowed(_value)) {
                var regex = new RegExp(_value, 'gi');
                var inner = _item.label.replace(regex, function(_match) {
                    return "<strong>" + _match + "</strong>";
                });

                itemElement.innerHTML = inner;
            } else {
                    itemElement.textContent = _item.label;
            }
 
            return itemElement;
        },
        emptyMsg: "MP3 not found",
        customize: function(_input, _inputRect, _container, _maxHeight) {
            if (isBlackBerry)
                _container.style.maxWidth = "500px";
            
            resultrow = 0;
/*      You can use the following snippet to display autocomplete above the 
input field if there is not enough space for it.*/
      if (_maxHeight < 100) {
                _container.style.top = "";
                _container.style.bottom = (window.innerHeight - _inputRect.bottom + _input.offsetHeight) + "px";
                _container.style.maxHeight = "140px";
            } // if (maxHeight < 100) {
                
        } // customize: function(input, inputRect, container, maxHeight) {
    }) // autocomplete({
} //  setupSearchAutoComplete() {
