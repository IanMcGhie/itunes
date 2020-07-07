"use strict";
// bb doesnt like the includes, let, const keyword, async functions, promises... ()=> syntax
// ooo...neat https://en.wikipedia.org/wiki/Trie
var itsTheBB   = true;  // default mode
var showPlayed = true;
var TEXT       = true;
var DEBUG      = true;
var DIR        = false;
var newSelect  = false;
var serverUrl  = "winamp:6502";
var chartPopupIndex = -1;
var bbTimer;
var chart;
var playList = [];
var state    = { 
    log: [],
    duration: 0,
    progress: 0
};

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
    var itsChrome  = !!window.chrome && (!!window.chrome.webstore || !!window.chrome.runtime);

    if (itsFirefox || itsChrome)
        setupWebSocket(); // this sets itsTheBB to false
            else
                bbTimer = setInterval(function() {// auto refresh
                    sendCommand("getstate");
                }, 10000);

    setupKBEvents();
    setupMouseEvents();
    setupVolumeControl();
    setupClock();
    setupTitleTicker();
    sendCommand('getplaylist');
    
    window.onresize = drawChart;
    document.body.style.color = "#0d0"; // set chart bar default color
}); // $(document).ready(function() {

function setupClock() {
    log(TEXT,"setupClock()");

    setInterval(function() { 
        if (!state.pause) {
            $("#clock").text((state.progress - state.duration).toMMSS());
            $("#progressbar").css("margin-left", -455 + (++state.progress / state.duration) * 400);
        }
    }, 1000); 
};

function setupTitleTicker() {
    log(TEXT,"setupTitleTicker()");

    setInterval(function() {
        if (($("#title").text().length > 0) && (state.log.length > 0))
            $("#title").text($("#title").text().slice(1));
                else
                    $("#title").text(playList[state.log[state.log.length - 1]]);
    }, 250); 
} // function setupTitleTicker() {

function sendCommand(_command) {
    log(TEXT,"sendCommand(" + _command + ")");

    $.getJSON(_command, function (_newState) {
        if (itsTheBB) {
            log(TEXT, "state retrieved thusly");
            log(DIR, _newState);

            if (_newState.log.length != state.log.length)   // log length has changed new song
                $("#title").text("");                       // is playing...reset ticker

            state = _newState;
            state.progress+=12;

            if (_command == "getstate") 
                updateUI('sendCommand(' + _command + ')');

            log(TEXT,"returning from getJSON");
        } // if (itsTheBB) {

        if (state.hasOwnProperty('playList')) {
            playList = state.playList;
            setupPlaylist();
            updateUI('sendCommand(' + _command + ')');
        }
    }); // $.getJSON(_command, function (_newState) {
}

function setupVolumeControl() {
    log(TEXT,"setupVolumeControl()");

    $("#volume").slider({
        animate: false,
        min: 0,
        max: 100,
        value: 0
    });
 
    $("#volume").on("slidechange", function(_event, _ui) {
        //  vol 0% -> 40 153 28  vol 100% -> 225 31 38
        //              28 99 1c             e1 1f 26 
        var r = toHex((_ui.value * 1.85 + 40));
        var g = toHex(((_ui.value) * 2 + 128));
        var b = toHex((_ui.value * 0.1) + 28);
        
        log(TEXT,"volume slidechange callback fired... new value -> " +  _ui.value + " color -> #" + r + g + b);

        if (state.hasOwnProperty('volume')) {
            log(TEXT,"volume slidechange callback fired... not sending volume back to server. Removing volume from state");
            delete state.volume;
            return;
        }

        $("#volume").css("background-color","#" + r + g + b);
        $.get("setvolume/" + _ui.value);
    }); // $("#volume").on("slidechange", function(_event, _ui) {
} // function setupVolumeControl() {

function toHex(_n) {
    var h = parseInt(_n).toString(16);
    return h.length < 2 ? "0" + h : h;;
}

function setupMouseEvents() {
    log(TEXT,"setupMouseEvents()");

    // this will cause slidechange jquery cb to fire
    $("#winampdiv").on("wheel", function(_event) {
        if (_event.originalEvent.deltaY < 0)
            $("#volume").slider("value",parseInt($("#volume").slider("value") + 1)); 
                else
                   $("#volume").slider("value",parseInt($("#volume").slider("value") - 1));
    });

    $("#playsong,#queuesong,#prev,#next,#pause,#shuffle,#shuffleenabled,#setvolume\\/mute").click(function() {
        if (((this).id == "playsong") || ((this).id == "queuesong"))
            sendCommand((this).id + "/" + getSearchInputSongIndex());    
                else
                    sendCommand((this).id);
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

    $("#chart").contextmenu(function() { // right click
        $("#charttooltip").remove();
        showPlayed = !showPlayed;
        drawChart();
    });
} // function setupMouseEvents() {

function setupKBEvents() {
    log(TEXT,"setupKBEvents()");
    
    $("body").keypress(function(_event) {
        log(TEXT,"body keypress -> " + _event.which);
        
        switch (_event.which) {
            case 90: // Z
            case 122: // z
                sendCommand("prev");
            break;

            case 66: // B
            case 98: // b
                sendCommand("next");
            break;

            case 77: // M
            case 109: // m
                sendCommand("setvolume/mute");
            break;

            case 67: // C
            case 99: // c
                sendCommand("pause");
            break;

            case 83: // S
            case 115: // s
                sendCommand("shuffle");
            break;

            case 79: // O
            case 111: // o
                $("#volume").slider("value", parseInt($("#volume").slider("value") + 1));
            break;

            case 73: // I
            case 105: // i
                $("#volume").slider("value", parseInt($("#volume").slider("value") - 1));
            break;

            case 74: // J
            case 106: // j
                $("#searchinput").focus();
            break;

            case 81: // Q
            case 113: // q
                var index = getSearchInputSongIndex();
                state.popupDialog = playList[index] + " queued.";
                sendCommand("queuesong/" + _index);
            break;
        } // switch (_event.which) {
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
    
    var currentSongTitle;

    currentSongTitle = playList[state.log[state.log.length - 1]];

    if (state.hasOwnProperty('popupDialog')) {
        log(TEXT,"state.popupDialog -> " + state.popupDialog);// + " removing state.popupDialog from state");

        $("#popupdialog").css("display", "block");
        $("#popupdialog").text(state.popupDialog);
        $("#popupdialog").delay(5000).hide(0);

    //    delete state.popupDialog;
    } 

    if (state.hasOwnProperty('volume'))             //  vol down -> 21 128 10  vol up -> 224 14 21
        $("#volume").slider("value", state.volume); // this will cause slidechange jquery cb to fire

    if (state.mute) 
        $("#setvolume\\/mute").css("display", "inline-block");
            else
                $("#setvolume\\/mute").css("display", "none");

    if (!itsTheBB) 
        drawChart();

    $("#songtitle").text(currentSongTitle + " (" + state.duration.toMMSS() + ")");
    $("#playlist>option:eq(" + state.log[state.log.length - 1] + ")").prop("selected", true);    
    $("#searchinput").val(currentSongTitle); 
    $("#shuffleenabled").css("visibility",state.shuffle ? "visible" : "hidden");
    $("#ispaused").attr("src",state.pause ? "/images/paused.png" : "/images/playing.png");
} // function updateUI(_logMsg) {

function setupWebSocket() {
    log(TEXT,"setupWebSocket()");

    itsTheBB   = false;
    var client = new WebSocket("ws://" + serverUrl,"winamp");
     
    $("body").css("text-align","center");
    $("body").css("font-weight","bold");
    $("body").css("font-size","24px");
    $("#clock").css("margin-left","-410px");
    $("#ispaused").css("margin-left","-420px");
    $("#shuffleenabled").css("margin-left","-182px");
    $("#searchinput").css("width","1020px");
    $("#songtitle").css("width","100%");
    $("#prev").attr("coords","28,150,65,180");
    $("#pause").attr("coords","107,150,145,180");
    $("#next").attr("coords","184,150,221,180");
    $("#shuffle").attr("coords","280,150,359,176");
    $("#mutedialog").css("left", (screen.width / 2) - (("Press M to unmute".length / 2) * 14) + "px");

    client.onmessage = function(_response) {
        var newState = JSON.parse(_response.data).state;

        if (state.hasOwnProperty('log') && state.hasOwnProperty('playList'))
            log(TEXT,"websocket data received currently playing -> " + playList[state.log[state.log.length - 1]]);

        if (newState.hasOwnProperty('log'))
            if (newState.log.length != state.log.length) // log length has changed new song
                $("#title").text("");                    // is playing...reset ticker

        state = newState;

        setupPlaylist();
        updateUI('websocket onmessage state received thusly');
        log(DIR, state);
    }
} // function setupWebSocket() {

function charsAllowed(_value) {
    return new RegExp(/^[a-zA-Z\s]+$/).test(_value);
}

function setupPlaylist() {
    log(TEXT,"setupPlaylist()");
    
    if (state.hasOwnProperty('log') && state.hasOwnProperty('playList'))
        $("#playlist").attr("size",playList.length < 20 ? playList.length : 20);

    for (var i = 0; i < playList.length; i++) {
        var select = document.getElementById("playlist");
        var option = document.createElement("option");

        option.setAttribute("id", i);
        option.text = playList[i];
        select.add(option);
    } 
    
    setupSearch();
} // function setupPlaylist() {

function setupSearch() {
    log(TEXT,"setupSearch()");

    $("#searchinput").focusin(function() {
        $("body").off("keypress");
        $("#searchinput").css("border", "1px solid #0d0");
          
        if (!newSelect) {
            $("#searchinput").val("");
            
            if (itsTheBB) // auto refresh
                clearInterval(bbTimer);
        }  else
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
/*
        if (itsTheBB) // auto refresh
            bbTimer = setInterval(function() {
                sendCommand("getstate");
            }, 5000);
            */
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
            var items   = playList.map(function(_n) {
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
            if (_maxHeight < 100) { // // display autocomplete above the input field if there is not enough space for it.
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
    var currentSongIndex = -1;
    
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
        }

        chartPopupIndex = this._active[0]._index;

        // highlight currently playing song
        if (chartPopupIndex == state.log[state.log.length - 1]) {
            ttElement.style.color = "#fd1";
            ttElement.style.border = "1px solid #fd1";
            innerHTML += '<thead><tr><th>' + playList[chartPopupIndex] + '</th></tr></thead>';
            } else {
                    ttElement.style.color = "#0d0";
                    ttElement.style.border = "1px solid #0d0";
                    innerHTML += '<thead><tr><th>' + playList[chartPopupIndex] + '</th></tr></thead>';
                    }

        innerHTML += '<tbody><tr><td>&nbsp<td></tr><tr><td>Right click for songs ' + (showPlayed ? "not" : "") + ' played.</td></tr></tbody></table>';

        ttElement.querySelector('table').innerHTML = innerHTML;
        ttElement.style.opacity = 1;
        ttElement.style.left    = (_ttModel.caretX / 1.4) + 'px';// window.width / 2;// (_ttModel.caretX) + 'px';
    };  // var customTooltips = function(_ttModel) {

    $("#chartcontainer").css("display","inline-block");
    
    currentSongIndex = state.log[state.log.length - 1];
    
    chartData.length = playList.length;
    chartData.fill(0);
    barThickness.length = playList.length;
    barThickness.fill(1);
    
    for (var i = 0; i < state.log.length;i++) { 
        barColors[state.log[i]] = document.body.style.color;
        chartData[state.log[i]]++;

        if (yMax < chartData[state.log[i]])
            yMax = chartData[state.log[i]];
    }

    // highlight currently playing
    barColors[currentSongIndex]    = "#fd1";
    chartData[currentSongIndex]    = yMax;
    barThickness[currentSongIndex] = 2;

    if (!showPlayed) // show songs not played
        for (var i = 0; i < playList.length;i++) 
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
            aspectRatio: 14,
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
                                if (playList[_index] != undefined)                         
                                    if ((playList[_index].slice(0,1) != lastLetter) && (_index - lastIndex > 40) && (!showPlayed || state.log.includes(_index))) {
                                        lastLetter = playList[_index].slice(0,1);
                                        lastIndex = _index;
                                        return lastLetter;
                                }
                            }  // callback: function(_value, _index, _values) { 
                        } // ticks: {
                    }], 
                yAxes: [{ ticks: { callback: function(_value, _index, _values) { return; } } }]
            } // scales: { 
        } // options: {
    }); //  chart = new Chart(ctx, {
} // function drawChart() {
 
function getSearchInputSongIndex() {
    for (var m = 0; m < playList.length; m++) 
        if (playList[m].includes($("#searchinput").val())) 
            return m;
}

function log(_type,_msg) {
    if (DEBUG)
        if (_type == TEXT)
            console.log(Date().split('GMT')[0] + _msg);
                else
                    console.dir(_msg);
}
