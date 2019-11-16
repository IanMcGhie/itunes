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

function getSongSelectedIndex() {
    return $("#playlist").find("option:selected").index();
}

function getSongPlaying() {
    // remove dir/ from front of still...playlist array includes mp3 a,b,c,d.. dirs
    return playList[state.currentlyplaying].replace(/^\/[a-z]\//gmi, "");
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
        if ($("#volume").slider("value") != state.volume)
            $.get("setvolume/" + parseInt($("#volume").slider("value")));
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
        $.get((this).id + "/" + getSongSelectedIndex());
    });

    $("#playlist").click(function() {
        $("#mp3search").val(playList[getSongSelectedIndex()].replace(/^\/[a-z]\//gmi, ""));
    })
} // function setupClickListeners() {

function setupPlayListKeyboardEvents() {
    $("#playlist").focusin(function() {
        $("body").unbind("keydown");
        $("#playlist").css("border", "2px solid #5f5");

        $("#playlist").keydown(function(_event) {
            console.log("key down -> " + _event.which);

            switch (_event.which) {
                case 13:
                    $.get("playsong/" + getSongSelectedIndex());
                    break;

                case 51: // 3
                    if (_event.altKey && (getSongSelectedIndex() > 0)) {
                        console.log("Hey! alt-3 event captured!");
                        event.preventDefault();
                    }
                    break;
            }; // switch (_event.which) {
        }); // $("#playlist").keydown(function(_event){
    }); // $("#playlist").focusin(function() {

    $("#playlist").focusout(function() {
        $("#mp3search,#playlist").unbind("keydown");
        $("#playlist").css("border", "1px solid #0f0");
        setupBodyKeyboardEvents();
    });
} // function setupPlayListKeyboardEvents(){

function setupBodyKeyboardEvents() {
    $("body").keydown(function(_event) {
        console.log("keyboard event -> " + _event.which)

        switch (_event.which) {
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
    }); // $("body").keydown(function(_event) {
} // function bodyKeyboardEvents(_event) {

function setupWebsocket() {
    var serverUrl = "ws://" + document.location.hostname + ":" + websocketPort;
    var client = new WebSocket(serverUrl, "json");

    client.onopen = function(_event) {
        console.log("onopen()");
    };

    client.onmessage = function(_event) {
        var select = document.getElementById("playlist");
        state = JSON.parse(_event.data);

        console.log("state received from server");
        console.dir(state);

        if (state.playlist.length > 0) {
            playList = state.playlist;
            setupSearchTextBox();

            for (var i = 0; i < playList.length; i++) {
                var option = document.createElement("option");

                option.setAttribute("id", i);
                //                option.text = playList[i];
                option.text = playList[i].replace(/^\/[a-z]\//gmi, "");
                select.add(option);

                //$("#playlist>option:eq(" + state.currentlyplaying + ")").prop('selected', true);

                $("#" + i).dblclick(function() {
                    $.get("playsong/" + (this).id)
                });

            } //   for (var i = 0;i < playList.length; i++) {
        } // if (state.hasOwnProperty('playlist')) {

        if (state.hasOwnProperty('queuesong')) {
            $("#dialog").css("display", "inline-block");
            $("#dialog").html(playList[state.queuesong] + " queued");
            $("#dialog").hide("drop", {
                direction: "down"
            }, 5000);
        }

        if (state.shuffle)
            $("#shuffleenabled").css("visibility", "visible");
        else
            $("#shuffleenabled").css("visibility", "hidden");

        $("#volume").slider("value", state.volume);
        $("#playlist>option:eq(" + state.currentlyplaying + ")").prop('selected', true);
        $("#songtitle,#title").text(getSongPlaying());
        $("#mp3search").val(getSongPlaying());
    }; // client.onmessage = function(_event) {

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
        return {
            label: n,
            group: "Results"
        }
    });

    $("#mp3search").focusin(function() {
        $("#mp3search").css("border", "2px solid #5f5");
        $("body").unbind("keydown");
        $("#mp3search").val("");

        $("#mp3search").keydown(function(_event) {
            if (_event.which == 13)
                $.get("playsong/" + getSongSelectedIndex());
        });
    }); // $("#mp3search").focusin(function(){

    $("#mp3search").focusout(function() {
        $("#mp3search").css("border", "1px solid #0f0");
        $("#mp3search").unbind("keydown");
        $("#mp3search").val(getSongPlaying());
        setupBodyKeyboardEvents();
    });

    autocomplete({
        input: document.getElementById('mp3search'),
        minLength: 2,
        onSelect: function(item, inputfield) {
//            inputfield.value = item.label;
            console.log("onselect ****")
            $("#mp3search").val(item.label.replace(/^\/[a-z]\//gmi, ""));

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

                itemElement.innerHTML = inner.replace(/^\/[a-z]\//gmi, "");
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