"use strict";
// bb doesnt like the const keyword...async functions....promises
// ooo...neat https://en.wikipedia.org/wiki/Trie
var TEXT          = true;
var DIR           = false;
var DEBUG         = true;
var newSelect     = false;
var popupSongIndex= 0;
var state         = { };
var chart;
var showPlayed    = true;

String.prototype.toMMSS = function() {
   var minutes = parseInt(this / 60);
   var seconds = this % 60;

    if (minutes < 10) 
        minutes = "0" + minutes;

    if (seconds < 10)
        seconds = "0" + seconds;
  
    return minutes + ":" + seconds;
} // String.prototype.toMMSS = function () {

$(document).ready(function() {
    var itsFirefox = typeof InstallTrigger !== 'undefined';
    var itsChrome = (!!window.chrome && (!!window.chrome.webstore || !!window.chrome.runtime));

    if (itsFirefox || itsChrome) // setup websocket or blackberry
        setupWebSocket(); 
//            else {
  //               setupSearchAutoComplete();
    //             populateSelectBox();
      //      }

    sendCommand('getstate/init'); 
    setupBodyKBEvents();
    setupPlayListKBEvents();
    setupMouseEvents();
    setupVolumeControl();
    setupTicker();
    setupClock();
    document.body.style.color = "#0d0"; // set chart bar default color
}); // $(document).ready(() => {

function setupClock() {
    log(TEXT,"setupClock()");

    setInterval(function() {
        if (!state.pause && (state.timeRemaining / state.duration) > 0) {
            var margin = ((state.timeRemaining / state.duration) * -390) - 60;

            $("#progressbar").css("margin-left", margin);
            $("#timeremaining").text('-' + state.timeRemaining.toString().toMMSS());

            state.timeRemaining--;
        } // if (!state.pause && state.timeRemaining > 0) {
    }, 1000); // setInterval(function() { 
}

function setupTicker() {
    log(TEXT,"setupTicker()");

    setInterval(function() {
        if ($("#title").text().length > 0)
            $("#title").text($("#title").text().slice(1));
                else
                    $("#title").text(state.playList[state.songsPlayed[state.songsPlayed.length - 1]]);
    }, 250); // setInterval(function() {
} // function setupTicker() {

function sendCommand(_command) {
    log(TEXT,"sendCommand(" + _command + ")");

    $.getJSON(_command, function(_state) {
        log(TEXT, "state retrieved thusly");
        log(DIR, _state);

        state = _state;
        
        if (_command == 'getstate/init') {
            $("#playlist").attr("size",state.playList.length < 20 ? state.playList.length : 20);
            setupSearchAutoComplete();
            populateSelectBox();
            drawChart();
        }

        updateUI("sendCommand(" + _command + ")");
    });
}

function setupVolumeControl() {
    $("#volume").slider({
        animate: false,
        min: 0,
        max: 100,
        value: 0
    });
 
    $("#volume").on("slidechange", function(_event, _ui) {
        if (state.hasOwnProperty('volume')) {
            log(TEXT,"not sending volume back to server. Removing volume from state");
            delete state.volume;
            return;
        }

        log(TEXT,"slidechange _ui.value -> " +  _ui.value);
        $.get("setvolume/" + _ui.value);
    });
} // function setupVolumeControl() {

function setupMouseEvents() {
    $("#winamp,#timeremaining").on("click", function () {
        sendCommand('getstate');
    });
    
    // this will cause slidechange jquery cb to fire
    $("#timeremaining,#winamp,#prev,#pause,#next,#shuffleenabled,#progressbar,#volume").on("wheel", function(_event) {
        if (_event.originalEvent.deltaY < 0)
            $("#volume").slider("value",parseInt($("#volume").slider("value") + 1)); 
                else
                   $("#volume").slider("value",parseInt($("#volume").slider("value") - 1));
    });

    $("#prev,#pause,#next,#shuffle,#shuffleenabled").click(function() {
        if ((this).id == "shuffle") 
            state.shuffle = !state.shuffle;
                else if ((this).id == "pause") 
                    state.pause = !state.pause;

        updateUI((this).id);
        sendCommand((this).id);
     });

    $("#playsong,#queuesong").click(function() {
        var index = getSearchInputSongIndex();

        if ((this).id == "queuesong")
            state.popupDialog = playList[index] + " queued.";

        updateUI((this).id + "/" + index);
        sendCommand((this).id + "/" + index);
    });
    
    $("#playlist").change(function() {
        $("#searchinput").val($("#playlist").val());
    });
    
    $("#playlist").dblclick(function() {
        sendCommand("playsong/" + getSearchInputSongIndex());
    });

    $("#chart").click(function () {
        if (!showPlayed)
            $.get("playsong/" + popupSongIndex);
                else if (document.getElementById('charttooltip'))
                        $.get("playsong/" + popupSongIndex);
    });

    $("#chart").contextmenu(function() {
        showPlayed = !showPlayed;
        drawChart();
    });
} // function setupMouseEvents() {

function setupPlayListKBEvents() {
    $("#playlist").focusin(function () {
        $("body").off("keypress");
        $("#playlist").css("border", "1px solid #0d0");

        $("#playlist").keyup(function (_event)  {
            log(TEXT,"key up -> " + _event.which);

            switch (_event.which) {
                case 13:
                    $.get("playsong/" + getSearchInputSongIndex());
                break;
                
                case 51: // 3
                    if (_event.altKey) {
                        log(TEXT,"Hey! alt-3 event captured!");
                        event.preventDefault();
                    }
                break;
            }; // switch (_event.which) {
        }); // $("#playlist").keyup((_event) => {
    }); // $("#playlist").focusin(() => {

    $("#playlist").focusout(function() {
        $("#playlist").off("keyup");
        $("#playlist").css("border", "1px solid #888");
        setupBodyKBEvents();
    });
} // function setupPlayListKBEvents(){

function setupBodyKBEvents() {
    $("body").keypress(function(_event) {
        log(TEXT,"body keypress -> " + _event.which);
        
        switch (_event.which) {
            case 122: // z
                sendCommand("prev");
            break;

            case 98: // b
                sendCommand("next");
            break;

            case 111: // o
                $("#volume").slider("value",parseInt($("#volume").slider("value") + 1));
            break;

            case 105: // i
                $("#volume").slider("value",parseInt($("#volume").slider("value") - 1));
            break;

            case 106: // j
                $("#searchinput").focus();
            break;

            case 109: // m
                state.mute = !state.mute;
                updateUI("setvolume/mute");
                sendCommand("setvolume/mute");
            break;

            case 99: // c
                state.pause = !state.pause;
                updateUI("pause");
                sendCommand("pause");
            break;

            case 115: // s
                state.shuffle = !state.shuffle;
                updateUI("shuffle");
                sendCommand("shuffle");
            break;

            case 113: // q
                var index = getSearchInputSongIndex();
                state.popupDialog = playList[index] + " queued.";
                sendCommand("queuesong/" + index);
            break;
        } // switch (_event.which) {
    }); // $("body").keyup(function(_event) {
} // function bodyKBEvents(_event) {

function updateUI(_logMsg) {
    log(TEXT,"updateUI(" + _logMsg + ")");

    var currentSongTitle = state.playList[state.songsPlayed[state.songsPlayed.length - 1]];

//    $("#title").text(currentSongTitle);
    $("#songtitle").text(currentSongTitle + " (" + state.duration.toString().toMMSS() + ")");
    $("#searchinput").val(currentSongTitle); 
    $("#playlist>option:eq(" + state.songsPlayed[state.songsPlayed.length - 1] + ")").prop("selected", true);
    $("#popupdialog").css("display", "none");
    $("#shuffleenabled").css("visibility",state.shuffle ? "visible" : "hidden");
    $("#ispaused").attr("src",state.pause ? "/images/paused.png" : "/images/playing.png");
    
    if (state.hasOwnProperty('popupDialog')) {
        log(TEXT,"state.popupDialog -> " + state.popupDialog);
        $("#popupdialog").css("display", "inline-block");
        $("#popupdialog").html(state.popupDialog);
        $("#popupdialog").css("right", state.popupDialog.length / 2 + "%");
        $("#popupdialog").css("left", state.popupDialog.length / 2 + "%");
        $("#popupdialog").delay(5000).hide(0);
        
        log(TEXT,"removing state.popupDialog from state");        
        delete state.popupDialog;
        } 

    if (state.hasOwnProperty('volume')) {
        // vol 0 ->   15 80 0a
        // vol 100 -> e0 0e 15
        var red   = parseInt((255 - state,volume * 1.27) / 16).toString(16);
        var green = parseInt((255 - state,volume * 1.27) / 16).toString(16);
        var blue  = parseInt((255 - state,volume * 1.27) / 16).toString(16);

        $("#volume").css("background-color","#" + red + green + blue);
        $("#volume").slider("value", state.volume); // this will cause slidechange jquery cb to fire
    }

    if (state.mute) {
        $("#mutedialog").css("right", "Muted.<br><br>Press m to unmute".length * 1.4 + "%");
        $("#mutedialog").css("left", "Muted.<br><br>Press m to unmute".length * 1.4 + "%");
        $("#mutedialog").css("display", "inline-block");
        $("#mutedialog").html("Muted.<br><br>Press m to unmute");
        } else
            $("#mutedialog").css("display", "none");
} // function updateUI() {

function setupWebSocket() {
    log(TEXT,"setupWebSocket()");
     var client = new WebSocket("ws://winamp:6502","winamp");

     $("body").css("width","100%");
     $("body").css("text-align","center");
     $("#searchinput").css("width","52%");

    client.onmessage = function(_response) {
        log(TEXT,"websocket data received");
        state = JSON.parse(_response.data).state;
        log(DIR, state);
        $("#title").text(state.playList[state.songsPlayed[state.songsPlayed.length - 1]]);
        updateUI("websocket onmessage");
        drawChart();
    } //   client.onmessage = function(_response) {
} 

function charsAllowed(_value) {
    var allowedChars = new RegExp(/^[a-zA-Z\s]+$/);
    return allowedChars.test(_value);
}

function populateSelectBox() {
    log(TEXT,"populateSelectBox()");
    // add playlist songs to select box
    for (var i = 0; i < state.playList.length; i++) {
        var select = document.getElementById("playlist");
        var option = document.createElement("option");

        option.setAttribute("id", i);
        option.text = state.playList[i];
        select.add(option);
    } // for (var i = 0; i < playList.length; i++) {
} // function populateSelectBox() {

function setupSearchAutoComplete() {
    log(TEXT,"setupSearchAutoComplete()");

    $("#searchinput").focusin(function() {
        $("body").off("keypress");
        $("#searchinput").css("border", "1px solid #0d0");
        
        if (!newSelect)
            $("#searchinput").val("");
                else
                    newSelect = false;

        $("#searchinput").keyup(function(_event) {      
            if (_event.which == 13)
                sendCommand("playsong/" + getSearchInputSongIndex());

            if (_event.which == 27)
                $("#searchinput").blur();
            });
    }); // $("#searchinput").focusin(() => {

    $("#searchinput").focusout(function() {
        $("#searchinput").css("border", "1px solid #888");
        $("#searchinput").off("keyup");
        $("#searchinput").val($("#playlist").find("option:selected").val());

        setupBodyKBEvents();
    }); // $("#searchinput").focusout(function() {

    autocomplete({
//        preventSubmit: true,
        input: document.querySelector('#searchinput'),//document.getElementById('searchinput'),
        minLength: 2,

        onSelect: function(_item, _inputfield) {
            //      log(LOG,"onselect ****");
            newSelect = true;
            $("#searchinput").val(_item.label);
            $("#searchinput").focus();
        },
        fetch: function(_match, _callback) {
            var match   = _match.toLowerCase();
            var items   = state.playList.map(function(_n) {
                return {
                    label: _n,
                    group: "Results"
                }
            });
        
            _callback(items.filter(function(_n) {
                 // log(LOG,"onfetch ****")
                if (_n.label) 
                    return _n.label.toLowerCase().indexOf(match) !== -1;
            }));
        },
        render: function(_item, _value) {
          //  log(LOG,"onrender ****")
            var itemElement = document.createElement("div");
            itemElement.id  = "resultrow_";

            if (charsAllowed(_value)) {
                var regex = new RegExp(_value, 'gi');
                var inner = _item.label.replace(regex, function(_match) {
                    return "<strong>" + _match + "</strong>";
                });

                itemElement.innerHTML = inner;
            } else 
                    itemElement.textContent = _item.label;
  
            return itemElement;
        },
        emptymessage: "MP3 not found",
        customize: function(_input, _inputRect, _container, _maxHeight) {
            // display autocomplete above the input field if there is not enough space for it.
            if (_maxHeight < 100) {
                _container.style.top = "";
                _container.style.bottom = (window.innerHeight - _inputRect.bottom + _input.offsetHeight) + "px";
                _container.style.maxHeight = "140px";
            } // if (maxHeight < 100) {
        } // customize: function(input, inputRect, container, maxHeight) {
    }) // autocomplete({
} //  setupSearchAutoComplete() {

function drawChart() {
    log(TEXT,"drawChart()");

    var barColors    = [];
    var barThickness = [];
    var chartData    = [];
    var lastLetter   = "";
    var lastIndex    = -1;
    var currentSongIndex = state.songsPlayed[state.songsPlayed.length - 1];
    var yMax = 0;

    $("#chartcontainer").css("display","inline-block");
    
    chartData.length = state.playList.length;
    chartData.fill(0);
    barThickness.length = state.playList.length;
    barThickness.fill(0);
    
    for (var i = 0; i < state.songsPlayed.length;i++) { 
        barColors[state.songsPlayed[i]] = document.body.style.color;
        chartData[state.songsPlayed[i]]++;
        barThickness[state.songsPlayed[i]] = 1;

        if (yMax < chartData[state.songsPlayed[i]])
            yMax = chartData[state.songsPlayed[i]];
    }

    // highlight currently playing
    barColors[currentSongIndex]     = "#fd1";
    barThickness[currentSongIndex]  = 3;
    chartData[currentSongIndex]     = yMax;

    if (!showPlayed) // show songs not played
        for (var i = 0; i < state.playList.length;i++) 
            if (chartData[i] == 0) {
                barColors[i] = document.body.style.color;
                chartData[i] = 1;
                barThickness[i] = 1;
            } else {
                chartData[i] = 0;
                chartData[currentSongIndex] = 2;
            }

    if (chart)
        chart.destroy();
    
    var customTooltips = function(_ttModel) {
        var ttElement = document.getElementById('charttooltip');
        var innerHtml = "<table>";

        // Hide if no tooltip
        if (this._active.length == 0 || !state.songsPlayed.includes(this._active[0]._index)) 
            if (showPlayed || this._active.length == 0) {
                $("#charttooltip").remove();
                return;
            }

        if (!ttElement) {
            log(TEXT,"creating tooltip div")

            ttElement = document.createElement('div');
            ttElement.id = 'charttooltip';
            ttElement.innerHTML = innerHtml;
            this._chart.canvas.parentNode.appendChild(ttElement);
        } // if (!ttElement) {

        popupSongIndex = this._active[0]._index;

        // highlight currently playing song
        if (popupSongIndex == state.songsPlayed[state.songsPlayed.length - 1]) {
            ttElement.style.color = "#fd1";
            ttElement.style.border = "1px solid #fd1";
            innerHtml += '<tr><th>Currently playing</th></tr>';
            innerHtml += '<tr><td>' + state.playList[popupSongIndex] + '</td></tr>';
            } else {
                    ttElement.style.color = "#0d0";
                    ttElement.style.border = "1px solid #0d0";
                    innerHtml += '<tr><th>Click to play</th></tr>';
                    innerHtml += '<tr><td>' + state.playList[popupSongIndex] + '</td></tr>';
            }
    
        innerHtml += '</table>';

        ttElement.querySelector('table').innerHTML = innerHtml;
        ttElement.style.opacity = 1;
        ttElement.style.left    = (_ttModel.caretX / 1.3) + 'px';// window.width / 2;// (_ttModel.caretX) + 'px';
    };  // var customTooltips = function(_ttModel) {

    chart = new Chart($("#chart"), {
        type: 'bar',
        data: {
            labels: chartData,
            datasets: [{
                data:  chartData,
                backgroundColor: barColors,
                barThickness: barThickness,
            }]
        },
        options: {
            legend: { display: false },
            animation: { duration: 0 },               
            responsive: true,
            aspectRatio: 15,
            title: { display: false },            
            tooltips: {
                enabled: false, // disable on-canvas tooltips
                mode: 'nearest', //index point dataset nearest x
                position: 'nearest',
                intersect: false,
                custom: customTooltips
            },
            scales: {
                xAxes: [{ 
                        ticks: {
                            autoSkip: false,
                            fontColor: '#0d0',
                            fontSize: '16',
                            callback: function(_value, _index, _values) { 
                                if ((state.playList[_index].slice(0,1) != lastLetter) && (_index - lastIndex > 40) || _index == 0) 
                                    if (!showPlayed || state.songsPlayed.includes(_index) || _index == 0) {
                                        lastLetter = state.playList[_index].slice(0,1);
                                        lastIndex = _index;
                                        return lastLetter;
                                    }
                            }  // callback: function(_value, _index, _values) { 
                        }
                    }], 
                yAxes: [{ ticks: { callback: function(_value, _index, _values) { return; } } }]
            } // scales: { 
        } // options: {
    }); //  chart = new Chart(ctx, {
} // function drawChart() {
 
function getSearchInputSongIndex() {
    for (var i = 0; i < state.playList.length; i++)
        if (state.playList[i].includes($("#searchinput").val()))
            return i;
}

function log(_type,_msg) {
    if (DEBUG)
        if (_type == TEXT)
            console.log(Date().split('GMT')[0] + _msg);
                else
                    console.dir(_msg);
//console.log("wtf -> " + _msg.isObject());
}
