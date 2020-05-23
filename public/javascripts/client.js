"use strict";
// bb doesnt like the const keyword...async functions....promises
var LOG = { log: 0, dir: 1 };

var popupSongIndex   = 0;
var itsTheBlackBerry = false;   
var debug = true;
var state = {};
var playList = [];
var chart;

$(document).ready(function() {
    var itsNotFirefox = typeof InstallTrigger === 'undefined';
    var itsNotChrome = !(!!window.chrome && (!!window.chrome.webstore || !!window.chrome.runtime));

    itsTheBlackBerry = itsNotFirefox && itsNotChrome;

//itsTheBlackBerry = true;
    snedCommand('getstate/withplaylist');
    
    if (itsTheBlackBerry) 
        setupBlackBerry(); // sync ui
            else
                setupWebSocket(); // async ui
            
    setupBodyKBEvents();
    setupPlayListKBEvents();
    setupMouseEvents();
    setupVolumeControl();
    setupTicker(250);
    setupClock();

    document.body.style.color = "#0d0"; // set chart bar default color
}); // $(document).ready(() => {

function setupBlackBerry() {
    $("body").css("width","768px");
    $("#searchinput").css("width","80%");
    $("#songtitle").css("font-size","16px");
    $("#songtitle").css("width","470px");
    $("body").css("text-align","left");
    //$("#searchinput").css("width","90%");
    $("#playlist").css("width","100%");
}
function setupClock() {
    log(LOG.log,"setupClock()");

    setInterval(function() {
        if (!state.pause && state.timeRemaining) {
            var margin = ((state.timeRemaining / state.duration) * -390) - 60;

            $("#progressbar").css("margin-left", margin);
            $("#timeremaining").text('-' + state.timeRemaining.toString().toMMSS());

            state.timeRemaining--;
        } // if (!state.pause && state.timeRemaining > 0) {
    }, 1000); // setInterval(function() { 
}

function setupTicker(_delayMs) {
    log(LOG.log,"setupTicker(" +  _delayMs + ")");

    setInterval(function() {
        if (state.hasOwnProperty('playList') && state.hasOwnProperty('songsPlayed'))
            if (($("#title").text().length > 0))
                $("#title").text($("#title").text().slice(1));
                    else
                        $("#title").text(playList[getCurrentSongIndex()]);
    }, _delayMs); // setInterval(function() {
}

String.prototype.toMMSS = function() {
   var minutes = parseInt(this / 60);
   var seconds = this % 60;

    if (minutes < 10) 
        minutes = "0" + minutes;

    if (seconds < 10)
        seconds = "0" + seconds;
  
    return minutes + ":" + seconds;
} // String.prototype.toMMSS = function () {

function snedCommand(_command) {
    log(LOG.log,"snedCommand(" + _command + ")");
//setTimeout(() => {


    $.getJSON(_command, function(_state) {
        state = _state;
        log(LOG.log, "state retrieved");
        log(LOG.dir, _state);
        
        if (state.hasOwnProperty('playList'))
            playList = state.playList

        setupSearchAutoComplete();
        populateSelectBox();
        updateUI("snedCommand(" + _command + ")");
    });

//},2000);

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
            log(LOG.log,"not sending volume back to server. Removing volume from state");
            delete state.volume;
            return;
        }

        log(LOG.log,"slidechange callback fired. Sending new value to server.  _ui.value -> " +  _ui.value);
        $.get("setvolume/" + _ui.value);
    });
} // function setupVolumeControl() {

function updateVolumeUI() {
    if (state.hasOwnProperty('volume')) {
        log(LOG.log,"updateVolumeUI() state.volume -> " + state.volume);

// vol 0 ->   15 80 0a
// vol 100 -> e0 0e 15

//var red   = parseInt((state.volume * 2.55) / 16).toString(16);
//var green = parseInt((255 - state,volume * 1.27) / 16).toString(16);

var red = parseInt((255 - state,volume * 1.27) / 16).toString(16);
var green = parseInt((255 - state,volume * 1.27) / 16).toString(16);
var blue = parseInt((255 - state,volume * 1.27) / 16).toString(16);

        $("#volume").css("background-color","#" + red + green + blue);
        $("#volume").slider("value", state.volume); // this will cause slidechange jquery cb to fire
    }
}
 
function setupMouseEvents() {
    $("#winamp").on("click", function () {
        snedCommand('getstate');
    })
    
    // this will cause slidechange jquery cb to fire
    $("#timeremaining,#winamp,#prev,#pause,#next,#shuffleenabled,#progressbar,#volume").on("wheel", function(_event) {
        if (_event.originalEvent.deltaY < 0)
            $("#volume").slider("value",parseInt($("#volume").slider("value") + 1)); 
                else
                   $("#volume").slider("value",parseInt($("#volume").slider("value") - 1));
    }) // $("#timeremaining,#winamp,#prev,#pause,#next,#shuffleenabled,#progressbar,#volume").on("wheel", function(_event) {

    $("#prev,#pause,#next,#shuffle,#shuffleenabled,#timeremaining").click(function() {
        if ((this).id == "shuffle") {
            state.shuffle = !state.shuffle;
            updateUI((this).id );
        }

        if ((this).id == "pause") {
            state.pause = !state.pause;
            updateUI((this).id);
        }

        snedCommand((this).id);
     });

    $("#playsong,#queuesong").click(function() {
        var index = getSearchInputSongIndex();
        state.popupDialog = playList[index] + " queued.";
        updateUI();
        snedCommand((this).id + "/" + index);
    });
    
    $("#playlist").change(function() {
        $("#searchinput").val($("#playlist").val());
    });
    
    $("#playlist").dblclick(function() {
        snedCommand("playsong/" + getSearchInputSongIndex());
    });

    $("#chart").click(function () {
        $.get("playsong/" + popupSongIndex);
    });
} // function setupMouseEvents() {

function setupPlayListKBEvents() {
    $("#playlist").focusin(function () {
        $("body").off("keypress");
        $("#playlist").css("border", "1px solid #0d0");

        $("#playlist").keyup(function (_event)  {
            log(LOG.log,"key up -> " + _event.which);

            switch (_event.which) {
                case 13:
                    $.get("playsong/" + getSearchInputSongIndex());
                break;
                
                case 51: // 3
                    if (_event.altKey) {
                        log(LOG.log,"Hey! alt-3 event captured!");
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
        log(LOG.log,"body keypress -> " + _event.which);
        
        switch (_event.which) {
            case 122: // z
                snedCommand("prev");
            break;

            case 98: // b
                snedCommand("next");
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
                updateUI();            
                snedCommand("setvolume/mute");
            break;

            case 99: // c
                state.pause = !state.pause;
                updateUI();            
                snedCommand("pause");
            break;

            case 115: // s
                state.shuffle = !state.shuffle;
                updateUI();
                snedCommand("shuffle");
            break;

            case 113: // q
                var index = getSearchInputSongIndex();
                state.popupDialog = playList[index] + " queued.";
                updateUI();
                snedCommand("queuesong/" + index);
            break;
        } // switch (_event.which) {
    }); // $("body").keyup(function(_event) {
} // function bodyKBEvents(_event) {

function getCurrentSongIndex() {
    return state.songsPlayed[state.songsPlayed.length - 1];
}

function updateUI(_logMsg) {
    log(LOG.log,"updateUI(" + _logMsg + ")");

    var currentSongTitle = playList[getCurrentSongIndex()];

    $("#title").text(currentSongTitle);
    $("#songtitle").text(currentSongTitle + " (" + state.duration.toString().toMMSS() + ")");
    $("#searchinput").val(currentSongTitle);
    $("#playlist>option:eq(" + getCurrentSongIndex() + ")").prop("selected", true);
    $("#popupdialog").css("display", "none");
    
    if (state.hasOwnProperty('popupDialog')) {
        log(LOG.log,"state.popupDialog -> " + state.popupDialog);
        $("#popupdialog").css("display", "inline-block");
        $("#popupdialog").html(state.popupDialog);
        $("#popupdialog").fadeOut(6000);
        
        log(LOG.log,"NOT removing state.popupDialog from state");        
    //    delete state.popupDialog;
        } 

    if (state.mute) {
        $("#popupdialog").css("display", "inline-block");
        $("#popupdialog").html("Muted.<br><br>Press m to unmute");
        } 
        
    if (state.shuffle)
        $("#shuffleenabled").css("visibility", "visible");
            else
                $("#shuffleenabled").css("visibility", "hidden");

    if (state.pause)
        $("#ispaused").attr("src","/images/ispaused.png");
            else
                $("#ispaused").attr("src","/images/isplaying.png");
    
    updateVolumeUI();
    
    if (!itsTheBlackBerry)
        drawChart();
            else
                $("#chart").css("display", "none");
} // function updateUI() {

function populateSelectBox() {
    log(LOG.log,"populateSelectBox()");
    // add playlist songs to select box
    for (var i = 0; i < playList.length; i++) {
        var select = document.getElementById("playlist");
        var option = document.createElement("option");

        option.setAttribute("id", i);
        option.text = playList[i];
        select.add(option);
    } // for (var i = 0; i < playList.length; i++) {
} // function populateSelectBox() {

function setupWebSocket() {
    log(LOG.log,"setupWebSocket()");
     var client = new WebSocket("ws://winamp:6502","winamp");

    client.onmessage = function(_response) {
        log(LOG.log,"websocket data received");
        state = JSON.parse(_response.data).state;
        log(LOG.dir,state);
        updateUI("websocket onmessage");
    } //   client.onmessage = function(_response) {
} 

function charsAllowed(_value) {
    var allowedChars = new RegExp(/^[a-zA-Z\s]+$/);
    return allowedChars.test(_value);
}

function setupSearchAutoComplete() {
    log(LOG.log,"setupSearchAutoComplete()");

    $("#searchinput").focusin(function() {
        $("body").off("keypress");
        $("#searchinput").css("border", "1px solid #0d0");
        $("#searchinput").val("");
        $("#searchinput").keyup(function(_event) {      
            if ((_event.which == 13) || (_event.which == 27))
                $("#searchinput").blur();
        }); // $("#searchinput").keyup(function(_event) {
    }); // $("#searchinput").focusin(() => {

    $("#searchinput").focusout(function() {
        $("#searchinput").css("border", "1px solid #888");
        $("#searchinput").off("keyup");
        $("#searchinput").val($("#playlist").find("option:selected").val());
        setupBodyKBEvents();
    }); // $("#searchinput").focusout(function() {

    autocomplete({
        preventSubmit: true,
        input: document.getElementById('searchinput'),
        minLength: 2,

        onSelect: function(_item, _inputfield) {
            //      log(LOG,"onselect ****");
            $("#searchinput").val(_item.label);
              $.get("playsong/" + playList.indexOf($("#searchinput").val()));
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
    var someVariable = 0;
    var barColors    = [];
    var barThickness = [];
    var chartData   = [];

    log(LOG.log,"drawChart()");
    
    chartData.length = playList.length;
    chartData.fill(0);
    barThickness.length = playList.length;
    barThickness.fill(1);

    for (var i = 0; i < state.songsPlayed.length;i++) {
        barColors[state.songsPlayed[i]] = document.body.style.color;
        chartData[state.songsPlayed[i]]++;

        if (chartData[state.songsPlayed[i]] > someVariable)
            someVariable = chartData[state.songsPlayed[i]];
    }

    // highlight currently playing
    barColors[getCurrentSongIndex()] = "#fd1";
    barThickness[getCurrentSongIndex()] = 2;
    chartData[getCurrentSongIndex()] = someVariable + 1;

    if (chart)
        chart.destroy();
    
    var customTooltips = function(_ttModel) {
        var ttElement = document.getElementById('chart-tooltip');
        var innerHtml = "<table>";

        if (!ttElement) {
            log(LOG.log,"creating tooltip div")
            
            ttElement = document.createElement('div');
            ttElement.id = 'chart-tooltip';
            ttElement.innerHTML = innerHtml;
            this._chart.canvas.parentNode.appendChild(ttElement);
        } // if (!ttElement) {

        // Hide if no tooltip
        if (this._active.length == 0) {
            ttElement.style.opacity = 0;
            return;
        }

        popupSongIndex = this._active[0]._index;

        // Hide if no tooltip
        if (!state.songsPlayed.includes(popupSongIndex)) {
            return;
        }

        // highlight currently playing song
        if (popupSongIndex == getCurrentSongIndex()) {
            ttElement.style.color = "#fd1";
            ttElement.style.border = "1px solid #fd1";
            innerHtml += '<tr><th>Currently playing</th></tr>';
            innerHtml += '<tr><td>' + playList[popupSongIndex] + '</td></tr>';
            } else {
                    ttElement.style.color = "#0d0";
                    ttElement.style.border = "1px solid #0d0";
                    innerHtml += '<tr><th>Click to play</th></tr>';
                    innerHtml += '<tr><td>' + playList[popupSongIndex] + '</td></tr>';
            }
    
        innerHtml += '</table>';

        ttElement.querySelector('table').innerHTML = innerHtml;
        ttElement.style.opacity = 1;
        ttElement.style.left    = (_ttModel.caretX / 2) + 'px';// window.width / 2;// (_ttModel.caretX) + 'px';
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
                xAxes: [{ ticks: { callback: function(_value, _index, _values) { return; } } }], 
                yAxes: [{ ticks: { callback: function(_value, _index, _values) { return; } } }]
            } // scales: { 
        } // options: {
    }); //  chart = new Chart(ctx, {
} // function drawChart() {
 
function getSearchInputSongIndex() {
    for (var i = 0; i < playList.length; i++)
        if (playList[i].includes($("#searchinput").val()))
            return i;
}

function log(_type,_msg) {
    if (debug)
        if (_type == LOG.log)
            console.log(_msg);
                else
                    console.dir(_msg);
}
