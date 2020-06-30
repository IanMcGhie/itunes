"use strict";
// bb doesnt like the const keyword, async functions, promises... ()=> syntax
// ooo...neat https://en.wikipedia.org/wiki/Trie
var itsTheBB   = true;  // default mode
var showPlayed = true;
var TEXT       = true;
var DEBUG      = true;
var newSelect  = false;
var DIR        = false;
var serverUrl  = "winamp:6502";
var state      = { };
var chart;
var chartPopupIndex = -1;

Number.prototype.toMMSS = function() {
    var minutes = parseInt(Math.abs(this) / 60);
    var seconds = Math.abs(this % 60);

    if (minutes < 10) 
        minutes = "0" + minutes;

    if (seconds < 10)
        seconds = "0" + seconds;

    if (this > 0)
        return minutes + ":" + seconds;
            else
                return "-" + minutes + ":" + seconds;
} // Integer.prototype.toMMSS = function() {

$(document).ready(function () {
    var itsFirefox = typeof InstallTrigger !== 'undefined';
    var itsChrome = (!!window.chrome && (!!window.chrome.webstore || !!window.chrome.runtime));

    if (itsFirefox || itsChrome)
        setupWebSocket(); // sets itsTheBB to false

//    setTimeout(function() {  // bb must wait here for response
        sendCommand('getplaylist'); 
//    }, 1);

    setupKBEvents();
    setupMouseEvents();
    setupVolumeControl();
    setupClock();
    setupTitleTicker();
    document.body.style.color = "#0d0"; // set chart bar default color
}); // $(document).ready(function() {

function setupClock() {
    log(TEXT,"setupClock()");

    setInterval(function() { 
        //            if (state.duration == 0) 
        //                return;

        if (itsTheBB && state.progress == state.duration - 1) // songs finished...
            sendCommand('getstate'); 

        var margin = -350 + state.progress / state.duration * 290;

        if (margin < 350 && !state.pause && state.progress <= state.duration) {
            $("#progressbar").css("margin-left", margin);
            $("#clock").text((state.progress - state.duration + 2).toMMSS());

            state.progress++;
        }
    }, 1000); 
};

function setupTitleTicker() {
    log(TEXT,"setupTitleTicker()");

    setInterval(function() {
        if (state.hasOwnProperty('playList') && state.hasOwnProperty('log'))
            if ($("#title").text().length > 0)
                $("#title").text($("#title").text().slice(1));
                    else
                        $("#title").text(state.playList[state.log[state.log.length - 1]]);
    }, 250); // setInterval(() = >{
} // function setupTitleTicker() {

function sendCommand(_command) {
    log(TEXT,"sendCommand(" + _command + ")");

    $.getJSON(_command, function (_state) {
        log(TEXT, "state retrieved thusly");
        log(DIR, _state);

        state = _state;
        
        if (_command == "getplaylist") {
            $("#playlist").attr("size",state.playList.length < 20 ? state.playList.length : 20);
            setupSearch();
            setupPlaylist();
        } 

//if (itsTheBB)
    setTimeout(function() {  // bb must wait here for response
        updateUI("sendCommand(" + _command + ")");
    }, 1050);
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
        log(TEXT,"slidechange volume -> " +  _ui.value);

        var r = parseInt(((((_ui.value / 100) * 255) / 255) * 234) + 21).toString(16);
        var g = parseInt((255 - (((_ui.value / 100) * 127)))).toString(16);
        var b = parseInt(((((_ui.value / 100) * 255) / 255) * 245) + 10).toString(16);

        $("#volume").css("background-color","#" + r + g + b);

        if (state.hasOwnProperty('volume')) {
            log(TEXT,"not sending volume back to server. Removing volume from state");

            delete state.volume;
            return;
        }

        $.get("setvolume/" + _ui.value);
    });
} // function setupVolumeControl() {

function setupMouseEvents() {
    $("#winampdiv").click(function() {
        if (itsTheBB)
            sendCommand('getstate');
    });
    
    $("#mutedialog").click(function() {
        state.mute = !state.mute;
        sendCommand("setvolume/mute");
    });

    // this will cause slidechange jquery cb to fire
    $("#winampdiv").on("wheel", function(_event) {
        if (_event.originalEvent.deltaY < 0)
            $("#volume").slider("value",parseInt($("#volume").slider("value") + 1)); 
                else
                   $("#volume").slider("value",parseInt($("#volume").slider("value") - 1));
    });

    $("#prev,#pause,#next,#shuffle,#shuffleenabled").click(function() {
        if ((this).id == "shuffle" || (this).id == "shuffleenabled") 
            state.shuffle = !state.shuffle;
                else if ((this).id == "pause") 
                    state.pause = !state.pause;

        sendCommand((this).id);
     });


    $("#playsong,#queuesong").click(function() {
        var index = getSearchInputSongIndex();

        if ((this).id == "queuesong")
            state.popupDialog = state.playList[index] + " queued.";

        sendCommand((this).id + "/" + index);
    });
    
    $("#playlist").change(function() {
        $("#searchinput").val($("#playlist").val());
    });
    
    $("#playlist").dblclick(function() {
        sendCommand("playsong/" + getSearchInputSongIndex());
    });

    $("#chart").click(function() {
        if (chartPopupIndex != -1)
            $.get("playsong/" + chartPopupIndex);
    });

    $("#chart").contextmenu(function() {
        $("#charttooltip").remove();
        showPlayed = !showPlayed;
        drawChart();
    });
} // function setupMouseEvents() {

function setupKBEvents() {
    $("body").keypress(function(_event) {
        log(TEXT,"body keypress -> " + _event.which);
        
        switch (_event.which) {
            case 122: // z
                sendCommand("prev");
            break;

            case 98: // b
                sendCommand("next");

                if (itsTheBB)
                    setTimeout(function() { 
                        //sendCommand('getstate');
    //                    updateUI("getstate keyup");
                    }, 1);
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
                sendCommand("setvolume/mute");
            break;

            case 99: // c
                state.pause = !state.pause;
                sendCommand("pause");
            break;

            case 115: // s
                state.shuffle = !state.shuffle;
                sendCommand("shuffle");
            break;

            case 113: // q
                var index = getSearchInputSongIndex();
                state.popupDialog = state.playList[index] + " queued.";
                sendCommand("queuesong/" + index);
            break;
        } // switch (_event.which) {

 //       if (itsTheBB)
   //         updateUI("body keyup");
    }); // $("body").keyup(function(_event) {

    $("#playlist").focusin(function() {
        $("body").off("keypress");
        $("#playlist").css("border", "1px solid #0d0");

        $("#playlist").keyup(function(_event) {
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
        }); // $("#playlist").keyup(function(_event) {
    }); // $("#playlist").focusin(function() {

    $("#playlist").focusout(function() {
        $("#playlist").off("keyup");
        $("#playlist").css("border", "1px solid #888");
        setupKBEvents();
    });
} // function bodyKBEvents(_event) {

function updateUI(_logMsg) {
    log(TEXT,"updateUI(" + _logMsg + ")");

    var currentSongTitle = state.playList[state.log[state.log.length - 1]];

    $("#songtitle").text(currentSongTitle + " (" + state.duration.toMMSS() + ")");

    if (!itsTheBB)
        $("#winamp").attr("src","/images/winamp470x200.png");

    $("#searchinput").val(currentSongTitle); 
    $("#playlist>option:eq(" + state.log[state.log.length - 1] + ")").prop("selected", true);
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

    if (state.hasOwnProperty('volume'))  //  vol down -> 21 128 10  vol up -> 224 14 21
        $("#volume").slider("value", state.volume); // this will cause slidechange jquery cb to fire

    if (state.mute) {
        if (itsTheBB)
            $("#mutedialog").css("left",  "10%");

        $("#mutedialog").css("display", "inline");
        $("#mutedialog").html("Press M to unmute");
        } else // if (state.mute) {
            $("#mutedialog").css("display", "none");

     if (!itsTheBB)
        drawChart();
} // function updateUI(_logMsg) {

function setupWebSocket() {
    log(TEXT,"setupWebSocket()");

    var client = new WebSocket("ws://" + serverUrl,"winamp");
    
    itsTheBB = false;
     
    $("body").css("text-align","center");
    $("#winamp").css("width","470px");
    $("#clock").css("font-size","40px");
    $("#clock").css("margin-left","-410px");
    $("#ispaused").css("margin-left","-420px");
    $("#volume").css("margin-left","-280px");
    $("#volume").css("width","100px");
    $("#shuffleenabled").css("margin-left","-182px");
    $("#searchinput").css("width","65%");
    $("#songtitle").css("width","100%");
    $("#prev").attr("coords","28,150,65,180");
    $("#pause").attr("coords","107,150,145,180");
    $("#next").attr("coords","184,150,221,180");
    $("#shuffle").attr("coords","280,150,359,176");

    client.onmessage = function(_response) {
        log(TEXT,"websocket data received");
        state = JSON.parse(_response.data).state;
        log(DIR, state);
        
        $("#title").text();
        updateUI("websocket onmessage");
    }
} // function setupWebSocket() {

function charsAllowed(_value) {
    return new RegExp(/^[a-zA-Z\s]+$/).test(_value);
}

function setupPlaylist() {
    log(TEXT,"setupPlaylist()");

    for (var i = 0; i < state.playList.length; i++) {
        var select = document.getElementById("playlist");
        var option = document.createElement("option");

        option.setAttribute("id", i);
        option.text = state.playList[i];
        select.add(option);
    } // for (var i = 0; i < playList.length; i++) {
} // function setupPlaylist() {

function setupSearch() {
    log(TEXT,"setupSearch()");

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
    }); // $("#searchinput").focusin(function() {

    $("#searchinput").focusout(function() {
        $("#searchinput").css("border", "1px solid #888");
        $("#searchinput").off("keyup");
        $("#searchinput").val($("#playlist").find("option:selected").val());

        setupKBEvents();
    }); // $("#searchinput").focusout(function() {

    autocomplete({  // preventSubmit: true,
        input: document.querySelector('#searchinput'),
        minLength: 2,

        onSelect: function(_item, _inputfield) { // log(LOG,"onselect ****");
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
        
            _callback(items.filter(function(_n) { // log(LOG,"onfetch ****")
                if (_n.label) 
                    return _n.label.toLowerCase().indexOf(match) !== -1;
            }));
        },
        render: function(_item, _value) {  //  log(LOG,"onrender ****")
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
} //  setupSearch() {

function drawChart() {
    log(TEXT,"drawChart()");

    var barColors    = [];
    var barThickness = [];
    var chartData    = [];
    var lastLetter   = "";
    var lastIndex    = -40;
    var yMax         = 0;
    var currentSongIndex = state.log[state.log.length - 1];

    $("#chartcontainer").css("display","inline-block");
    
    chartData.length = state.playList.length;
    chartData.fill(0);
    barThickness.length = state.playList.length;
    barThickness.fill(1);
    
    for (var i = 0; i < state.log.length;i++) { 
        barColors[state.log[i]] = document.body.style.color;
        chartData[state.log[i]]++;

        if (yMax < chartData[state.log[i]])
            yMax = chartData[state.log[i]] + 1;
    }

    // highlight currently playing
    barColors[currentSongIndex]    = "#fd1";
    chartData[currentSongIndex]    = yMax;
    barThickness[currentSongIndex] = 2;

    if (!showPlayed) // show songs not played
        for (var i = 0; i < state.playList.length;i++) 
            if (chartData[i] == 0) {
                barColors[i] = document.body.style.color;
                chartData[i] = 1;
                chartData[currentSongIndex] = 2;
            } else {
                chartData[i] = 0;
                chartData[currentSongIndex] = 2;
            }

    if (chart)
        chart.destroy();
    
    var customTooltips = function(_ttModel) {
        var ttElement = document.getElementById('charttooltip');
        var innerHTML = "<table>";

        // Hide if no tooltip
        if (this._active.length == 0 || !state.log.includes(this._active[0]._index) && showPlayed) {
            $("#charttooltip").remove();
            chartPopupIndex = -1;
            return;
        }

        if (!ttElement) {
            log(TEXT,"creating tooltip div")
            ttElement = document.createElement('div');
            ttElement.id = 'charttooltip';
            ttElement.innerHTML = innerHTML;
            this._chart.canvas.parentNode.appendChild(ttElement);
        } // if (!ttElement) {

        chartPopupIndex = this._active[0]._index;

        // highlight currently playing song
        if (chartPopupIndex == state.log[state.log.length - 1]) {
            ttElement.style.color = "#fd1";
            ttElement.style.border = "1px solid #fd1";
            innerHTML += '<thead><tr><th>' + state.playList[chartPopupIndex] + '</th></tr></thead>';
            } else {
                    ttElement.style.color = "#0d0";
                    ttElement.style.border = "1px solid #0d0";
                    innerHTML += '<thead><tr><th>' + state.playList[chartPopupIndex] + '</th></tr></thead>';
                }
                    
        if (showPlayed)
            innerHTML += '<tbody><tr><td>&nbsp<td></tr><tr><td>Right click for songs not played.</td></tr></tbody>';
                else
                    innerHTML += '<tbody><tr><td>&nbsp<td></tr><tr><td>Right click for songs played.</td></tr></tbody>';

        innerHTML += '</table>';

        ttElement.querySelector('table').innerHTML = innerHTML;
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
                                if ((state.playList[_index].slice(0,1) != lastLetter) && (_index - lastIndex > 40) && (!showPlayed || state.log.includes(_index))) {
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
}
