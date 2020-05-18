"use strict";
// bb doesnt like the const keyword...async functions....promises
var serverUrl   = "ws://winamp:6502";
var state       = {};
var playList    = [];
var itsTheBlackBerry = false;
var chart;
var debug       = true;
var LOG         = 0;
var DIR         = 1;
var popupSongIndex = 0;
var playCount    = [];

$(document).ready(function() {
    var itsNotFirefox = typeof InstallTrigger === 'undefined';
    var itsNotChrome = !(!!window.chrome && (!!window.chrome.webstore || !!window.chrome.runtime));

    itsTheBlackBerry = itsNotFirefox && itsNotChrome;

    getState('getplaylist');
    getState('getstate');

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

    document.body.style.color = "#0d0"; 
}); // $(document).ready(() => {

function setupClock() {
    log(LOG,"setupClock()");

    setInterval(function() {
        if (!state.paused && (state.timeRemaining > 0)) {
            state.timeRemaining--;
            var margin = ((state.timeRemaining / state.duration) * -395) - 60;

            $("#progressbar").css("margin-left", margin);
            $("#timeremaining").text('-' + state.timeRemaining.toString().toMMSS());
        } // if (!state.paused && state.timeRemaining > 0) {
    }, 1000); // setInterval(function() { 
}

function setupTicker(_delayMs) {
    log(LOG,"setupTicker(" +  _delayMs + ")");

    setInterval(function() {
        if (state.hasOwnProperty('songsPlayed'))
            if ($("#title").text().length > 0)
                $("#title").text($("#title").text().slice(1));
                    else
                        $("#title").text(playList[getCurrentSongIndex()]);
    }, _delayMs); // setInterval(function() {
}

String.prototype.toMMSS = function() {
    var minutes = parseInt(this / 60);
    var seconds = this - (minutes * 60);

    if (minutes < 10) 
        minutes = "0" + minutes;

    if (seconds < 10)
        seconds = "0" + seconds;
  
    return minutes + ":" + seconds;
} // String.prototype.toMMSS = function () {

function getState(_getWhat) {
    log(LOG,"getState(" + _getWhat + ")");

    setTimeout(function () {
        $.getJSON(_getWhat, function(_state) {
            if (_getWhat == "getplaylist") {
                playList = _state;
                setupSearchAutoComplete();
                populateSelectBox();
                } else {
                        state = _state;
                        log(DIR,state);
                        updateUI();
                        updateVolumeUI();
                }
        });
    }, 250);
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
            log(LOG,"not sending volume back to server. Removing state.volume from state");
            delete state.volume;
            return;
        }

        log(LOG,"slidechange callback fired. Sending new value to server.  _ui.value -> " +  _ui.value);
        $.get("setvolume/" + _ui.value);
    });
} // function setupVolumeControl() {

function updateVolumeUI() {
    if (state.hasOwnProperty('volume')) {
        log(LOG,"updateVolumeUI() -> " + state.volume);
    
        var red   = parseInt((state.volume * 2.55) / 16).toString(16);
        var green = parseInt((255 - state,volume * 1.27) / 16).toString(16);
        var blue  = "0";

        $("#volume").css("background-color","#" + red + green + blue);
        $("#volume").slider("value", state.volume); // this will cause slidechange jquery cb to fire
    }
}
 
function setupMouseEvents() {
    $("#winamp").on("click", function () {
        getState('getstate');
    })

    // mouse wheel volume control
    $("#timeremaining,#winamp,#prev,#pause,#next,#shuffleenabled,#progressbar,#volume").on("wheel", function(_event) {
        if (_event.originalEvent.deltaY < 0)
            $("#volume").slider("value",parseInt($("#volume").slider("value") + 1));
                else
                   $("#volume").slider("value",parseInt($("#volume").slider("value") - 1));
    }) // $("#timeremaining,#winamp,#prev,#pause,#next,#shuffleenabled,#progressbar,#volume").on("wheel", function(_event) {

    $("#prev,#pause,#next,#shuffle,#timeremaining").click(function() { 
        getState((this).id);
     });

    $("#playsong,#queuesong").click(function() {
        getState((this).id + "/" + getSearchInputSongIndex());
    });
    
    $("#playlist").change(function() {
        $("#searchinput").val($("#playlist").val());
    });
    
    $("#playlist").dblclick(function() {
        getState("playsong/" + getSearchInputSongIndex());
    });

    $("#chart").click(function () {
        if (playCount[popupSongIndex] > 0)
            $.get("playsong/" + popupSongIndex);
    });
} // function setupMouseEvents() {

function setupPlayListKBEvents() {
    $("#playlist").focusin(function () {
        $("body").off("keypress");
        $("#playlist").css("border", "1px solid #0d0");

        $("#playlist").keyup(function (_event)  {
            log(LOG,"key up -> " + _event.which);

            switch (_event.which) {
                case 13:
                    $.get("playsong/" + getSearchInputSongIndex());
                break;
                
                case 51: // 3
                    if (_event.altKey) {
                        log(LOG,"Hey! alt-3 event captured!");
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
        log(LOG,"keypress -> " + _event.which);
        
        switch (_event.which) {
            case 122: // z
                getState("prev");
            break;

            case 98: // b
                getState("next");
            break;

            case 111: // o
                $("#volume").slider("value",parseInt($("#volume").slider("value") + 1));
                updateVolumeUI();
            break;

            case 105: // i
                $("#volume").slider("value",parseInt($("#volume").slider("value") - 1));
                updateVolumeUI();
            break;

            case 106: // j
                $("#searchinput").focus();
            break;

            case 109: // m
                getState("setvolume/mute");
            break;

            case 99: // c
                getState("pause");
            break;

            case 115: // s
                getState("shuffle");
            break;

            case 113: // q
                getState("queuesong/" + getSearchInputSongIndex());
            break;
        } // switch (_event.which) {
    }); // $("body").keyup(function(_event) {
} // function bodyKBEvents(_event) {

function getCurrentSongIndex() {
        return state.songsPlayed[state.songsPlayed.length - 1];
}

function updateUI() {
    log(LOG,"updateUI()");

    var currentSongTitle = playList[getCurrentSongIndex()];
    
    $("#title").text(currentSongTitle);
    $("#songtitle").text(currentSongTitle + " (" + state.duration.toString().toMMSS() + ")");
    $("#searchinput").val(currentSongTitle);
    $("#playlist>option:eq(" + getCurrentSongIndex() + ")").prop('selected', true);
    $("#popupdialog").css("display", "none");
    
    if (state.hasOwnProperty('queueSong')) {
        log(LOG,"Queueing song #" + state.queueSong + " -> " + playList[state.queueSong]);
        $("#popupdialog").css("display", "inline-block");
        $("#popupdialog").html(playList[state.queueSong] + " queued.");
        $("#popupdialog").fadeOut(6000);
        
        log(LOG,"removing state.queueSong from state");        
        delete state.queueSong;
        } 

    if (state.mute) {
        $("#popupdialog").css("display", "inline-block");
        $("#popupdialog").html("Muted.<br><br>Press m to unmute");
        } 
        
    if (state.shuffle)
        $("#shuffleenabled").css("visibility", "visible");
            else
                $("#shuffleenabled").css("visibility", "hidden");

    if (state.paused)
        $("#ispaused").attr("src","/images/ispaused.png");
            else
                $("#ispaused").attr("src","/images/isplaying.png");

    if (!itsTheBlackBerry)
        setupChart();
            else
                $("#chart").css("display", "none");
} // function updateUI() {

function populateSelectBox() {
    log(LOG,"populateSelectBox()");
    // add playlist songs to select box
    for (var i = 0; i < playList.length; i++) {
        var select = document.getElementById("playlist");
        var option = document.createElement("option");

        option.setAttribute("id", i);
        option.text = playList[i];
        select.add(option);
    } // for (var i = 0; i < playList.length; i++) {
} // function populateSelectBox() {

function setupBlackBerry() {
    $("body").css("width","768px");
  //  $("body").css("margin-left","0px");
    $("body").css("text-align","left");
//    $("#searchinput").css("width","80%");
    $("#playlist").css("width","100%");
}

function setupWebSocket() {
    log(LOG,"setupWebSocket()");
     var client = new WebSocket(serverUrl,"winamp");

    client.onmessage = function(_response) {
        log(LOG,"ommessage state received");
        state = JSON.parse(_response.data).state;
        log(DIR,state);
        
        if (state.hasOwnProperty('songsPlayed')) {
            setTimeout(function () {
                updateUI();
                updateVolumeUI();
            }, 250);
        }
    } //   client.onmessage = function(_response) {
} 

function charsAllowed(_value) {
    var allowedChars = new RegExp(/^[a-zA-Z\s]+$/);
    return allowedChars.test(_value);
}

function setupSearchAutoComplete() {
    log(LOG,"setupSearchAutoComplete() playList.length -> " + playList.length);

    $("#searchinput").focusin(function() {
        $("#searchinput").css("border", "1px solid #0d0");
        $("#searchinput").val("");

        $("body").off("keypress");
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
    //        if (itsTheBlackBerry)
      //          _container.style.maxWidth = "768px";
            
            // You can use the following snippet to display autocomplete
            // above the input field if there is not enough space for it.
            if (_maxHeight < 100) {
                _container.style.top = "";
                _container.style.bottom = (window.innerHeight - _inputRect.bottom + _input.offsetHeight) + "px";
                _container.style.maxHeight = "140px";
            } // if (maxHeight < 100) {
        } // customize: function(input, inputRect, container, maxHeight) {
    }) // autocomplete({
} //  setupSearchAutoComplete() {

function setupChart() {
    log(LOG,"setupChart()");

    var customTooltips = function(_ttModel) {
        var index = -1;
        var ttElement = document.getElementById('chart-tooltip');

        if (!ttElement) {
            log(LOG,"creating tooltip div")
            
            ttElement = document.createElement('div');
            ttElement.id = 'chart-tooltip';

            ttElement.innerHTML = "<table>";

            this._chart.canvas.parentNode.appendChild(ttElement);
        } // if (!ttElement) {

        function getBody(_bodyItem) {
            return _bodyItem.lines;
        }

        if (this._active.length == 0) {
            ttElement.style.opacity = 0;
            return;
        }

        index = this._active[0]._index;
        popupSongIndex = index;

        // Hide if no tooltip
        if (!state.songsPlayed.includes(index) || (this._active.length == 0)) {
            ttElement.style.opacity = 0;
            return;
        }

        // Set Text
        log(LOG,"tooltip set text")
        var bodyLines = _ttModel.body.map(getBody);
        var innerHtml = "";
        var ttWidth = parseInt($(ttElement).css('width')) * 2;     //$(ttElement).css("table-width");
        var mouseX = _ttModel.caretX;
        var leftDist = 100;
        var rightDist = 2;
        var dbstr = "false";

        $(ttElement).css("table-width","max");

        // highlight currently playing song
        if (index == getCurrentSongIndex()) {
            ttElement.style.color = "#fd1";
            ttElement.style.border = "1px solid #fd1";
            innerHtml += '<tr><th>Currently playing<br><br></th></tr>';
            innerHtml += '<tr><td>' + playList[index] + '</td></tr>';
            ttElement.style.width = ttWidth;
            } else {
                    ttElement.style.color = "#0d0";
                    ttElement.style.border = "1px solid #0d0";

                    if ((leftDist < 0) || (leftDist > window.innerWidth))
                        ttElement.style.border = "1px solid #f00";

                    innerHtml += '<tr><th>Click to play<br><br></th></tr>';
                    innerHtml += '<tr><td>' + playList[index] + '</td></tr>';
  
                    if (dbstr != "false") {
                        innerHtml += '<tr><td>ttWidth: ' + ttWidth + '</td></tr>';
                        innerHtml += '<tr><td>window resolution: ' + window.innerWidth + ' X ' + window.innerHeight + '</td></tr>';
                        innerHtml += '<tr><td>mouseX: ' +  mouseX + '</td></tr>';
                        innerHtml += '<tr><td>distance from left: ' + leftDist + '</td></tr>';
                        innerHtml += '<tr><td>distance from right: ' + rightDist + '</td></tr>';
                    }
            }
    
        innerHtml += '</table>';

        var tableRoot = ttElement.querySelector('table');
        tableRoot.innerHTML = innerHtml;

        ttElement.style.opacity     = 1;
        ttElement.style.left        = (_ttModel.caretX / 2) + 'px';// window.width / 2;// (_ttModel.caretX) + 'px';
        ttElement.style.fontFamily  = _ttModel._bodyFontFamily;
        ttElement.style.fontSize    = _ttModel.bodyFontSize + 'px';
        ttElement.style.fontStyle   = _ttModel._bodyFontStyle;
    };  // var customTooltips = function(_ttModel) {
    
    var barColors    = [];
    var barThickness = [];
    var maxPlayCount = 0;

    playCount.length = playList.length;
    playCount.fill(0);
    barThickness.length = playList.length;
    barThickness.fill(1);

    for (var i = 0; i < state.songsPlayed.length;i++) {
        barColors[state.songsPlayed[i]] = document.body.style.color;
        playCount[state.songsPlayed[i]]++;

        if (playCount[state.songsPlayed[i]] > maxPlayCount)
            maxPlayCount = playCount[state.songsPlayed[i]];
    }

    // highlight currently playing
    barColors[getCurrentSongIndex()] = "#fd1";
    barThickness[getCurrentSongIndex()] = 2;
    playCount[getCurrentSongIndex()] = maxPlayCount;

    if (chart)
        chart.destroy();
    
    Chart.defaults.global.pointHitDetectionRadius = 1;

    chart = new Chart($("#chart"), {
        type: 'bar',
        data: {
            labels: playCount,
            datasets: [{
                data:  playCount,
                backgroundColor: barColors,
                barThickness: barThickness,
            }]
        },
        options: {
            layout: {
                padding: 10,
            },
            gridLines: {
                display: false
            },
            animation: {
                duration: 0
            },
            legend: {
                position: 'bottom',
                display: false
            },                
            responsive: true,
            aspectRatio: 15,  
            tooltips: {
                        enabled: false, // disable on-canvas tooltips
                        mode: 'nearest', //index point dataset nearest x
                        position: 'nearest',
                        intersect: false,
                        bodyFontSize: 20,
                        bodyFontFamily: 'hack',
                        custom: customTooltips
                    },
                title: {
                    display: false
                },
                scales: {  
                    xAxes: [{
                        ticks: {
                            callback: function(_value, _index, _values) { return; }
                        } // ticks: {
                    }], // xAxes: [{
                    yAxes: [{
                        ticks: {
                            min: 0,
                            stepSize: 1,
                            callback: function(_value, _index, _values) { return; }
                    } // ticks: {
                }] // yAxes: [{
            } // scales: { 
        } // options: {
    }); //  chart = new Chart(ctx, {
} // function setupChart() {
 
function getSearchInputSongIndex() {
    for (var i = 0; i < playList.length; i++)
        if (playList[i].includes($("#searchinput").val()))
            return i;
}

function log(_type,_msg) {
    if (debug)
        if (_type == LOG)
            console.log(_msg);
                else
                    console.dir(_msg);
}
