"use strict";
// bb doesnt like the const keyword
var wsPort      = 6502;
var wsHost      = "winamp";
var serverUrl   = "ws://" + wsHost + ":" + wsPort;
var state       = {};
var chart;
var itsTheBlackerry = false;
var playList = [];

$(document).ready(function() {
    var itsNotFirefox = typeof InstallTrigger === 'undefined';
    var itsNotChrome = !(!!window.chrome && (!!window.chrome.webstore || !!window.chrome.runtime));

    itsTheBlackerry = itsNotFirefox && itsNotChrome;

    if (itsTheBlackerry) 
        setupBlackerry();
            else
                setupWebSocket();
            
    setupBodyKBEvents();
    setupPlayListKBEvents();
    setupMouseEvents();
    setupVolumeControl();
    setupTicker(250);
    setupClock();

    document.body.style.color = "#0d0"; 
}); // $(document).ready(() => {

function setupClock() {
    console.log("setupClock()");

    setInterval(function() { 
        var margin = -(state.timeRemaining / state.duration) * 375 + 150;

        if (!state.paused && state.timeRemaining > 0) {
            state.timeRemaining--

            if (margin < 375 && (margin < 150)) {
                $("#progressbar").css("left", margin);
                $("#timeremaining").text('-' + state.timeRemaining.toString().toMMSS());
            }
        } // if (!state.paused && state.timeRemaining > 0) {
    }, 1000); // setInterval(function() { 
}

function setupTicker(_delayMs) {
    console.log("setupTicker()");

    setInterval(function() {
        if ($("#title").text().length > 0)       
            $("#title").text($("#title").text().slice(1));
                else
                    $("#title").text(playList[state.songsPlayed[state.songsPlayed.length - 1]]);
    }, _delayMs); // setInterval(function() {
}

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
    console.log("getBBState(" +  _getWhat + ")");

    setTimeout(function () {
        if (_getWhat == "getbbplaylist")
            $.getJSON(_getWhat, function(_playList) {
                setupSearchAutoComplete();
                playList = _playList;
                populateSelectBox();
            });
            
        if (_getWhat == "getbbstate") 
            $.getJSON(_getWhat, function(_state) {
                state = _state;
                updateUI();
            });
    },750);
}

function setupVolumeControl() {
    $("#volume").slider({
        animate: false,
        min: 0,
        max: 100,
        value: 0
    });
 
    $("#volume").on("slidechange", function(_event, _ui) {
        state.volume = _ui.value;
        $.get("setvolume/" + state.volume);
  //      setVolume();
    });
} // function setupVolumeControl() {

function setVolume() {
    console.log("setVolume() -> " + state.volume);

    var red   = parseInt((state.volume * 2.55) / 16).toString(16);
    var green = parseInt((255 - state.volume * 1.27) / 16).toString(16);
    var blue  = "0";

    $("#volume").css("background-color","#" + red + green + blue);
    $("#volume").slider("value", state.volume);
    
 //   $.get("setvolume/" + state.volume);
}
 
function setupMouseEvents() {
    $("#pause").on("click", function () {
        $.get("pause");

        if (itsTheBlackerry)
            state.paused = !state.paused; 
    })

    $("#winamp").on("click", function () {
        if (itsTheBlackerry)
            getBBState("getbbstate");
    })

    // mouse wheel volume control
    $("#timeremaining,#winamp,#prev,#pause,#next,#shuffleenabled,#progressbar,#volume").on("wheel", function(_event) {
        if (_event.originalEvent.deltaY < 0)
            state.volume++;
                else
                   state.volume--;

        setVolume();
    }) // $("#timeremaining,#winamp,#prev,#pause,#next,#shuffleenabled,#progressbar,#volume").on("wheel", function(_event) {

    $("#prev,#next,#shuffle,#timeremaining").click(function() { 
        $.get((this).id); 

        if (itsTheBlackerry)
            getBBState("getbbstate");

     });

    $("#queuesong").click(function() {
        if (itsTheBlackerry) {
            $("#dialog").css("display", "inline-block");
            $("#dialog").html($("#searchinput").val() + " queued.");
            $("#dialog").hide("drop", { direction: "down" }, 5000);
        } 

        $.get("queuesong/" + getSearchInputSongIndex());
    });

    $("#playsong").click(function() {
         $.get("playsong/" + getSearchInputSongIndex());
    });
    
    $("#playlist").dblclick(function() {
        $.get("playsong/" + getSearchInputSongIndex());
    });
} // function setupMouseEvents() {

function setupPlayListKBEvents() {
    $("#playlist").focusin(function () {
        $("body").off("keyup");
        $("#playlist").css("border", "1px solid #0d0");

        $("#playlist").keyup(function (_event)  {
            console.log("key up -> " + _event.which);

            switch (_event.which) {
                case 13:
                    $.get("playsong/" + getSearchInputSongIndex());
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
        $("#playlist").css("border", "1px solid #888");
        setupBodyKBEvents();
    });
} // function setupPlayListKBEvents(){

function setupBodyKBEvents() {
    $("body").keyup(function(_event) {
        switch (_event.which) {
            case 90: // z
                $.get("prev");
                
                if (itsTheBlackerry) 
                    getBBState("getbbstate");
            break;

            case 66: // b
                $.get("next");

                if (itsTheBlackerry)
                   getBBState("getbbstate");
            break;

            case 79: // o
                state.volume++;
                setVolume();
            break;

            case 73: // i
                state.volume--;
                setVolume();
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

                if (itsTheBlackerry)
                    getBBState("getbbstate")
            break;

            case 81: // q
                $.get("queuesong/" + getSearchInputSongIndex());
            break;
        } // switch (_event.which) {
    }); // $("body").keyup(function(_event) {
} // function bodyKBEvents(_event) {

function updateUI() {
    console.log("updateUI()");
    var currentlyPlaying = playList[state.songsPlayed[state.songsPlayed.length -1]];

    $("#title").text(currentlyPlaying);
    $("#songtitle").text(state.songsPlayed.length + ". " + currentlyPlaying + " (" + parseInt(state.duration).toString().toMMSS() + ")");
    $("#searchinput").val(currentlyPlaying);

    setVolume();

    if (playList.length > 0)
        $("#playlist>option:eq(" + state.songsPlayed[state.songsPlayed.length - 1] + ")").prop('selected', true);

    if (state.shuffle)
        $("#shuffleenabled").css("visibility", "visible");
            else
                $("#shuffleenabled").css("visibility", "hidden");
 
    if (!itsTheBlackerry)
        setupChart();
} // function updateUI() {

function populateSelectBox() {
    console.log("populateSelectBox()");
    // add playlist songs to select box
    for (var i = 0; i < playList.length; i++) {
        var select = document.getElementById("playlist");
        var option = document.createElement("option");

        option.setAttribute("id", i);
        option.text = playList[i];
        select.add(option);
    } // for (var i = 0; i < playList.length; i++) {
    
    $("#playlist").change(function() {
        $("#searchinput").val($("#playlist").val());
    });
} // function populateSelectBox() {

function setupBlackerry() {
    $("body").css("width","500px");
    $("body").css("margin-left","0px");
    $("#progressbar").css("display","absolute");
    $("#searchinput").css("width","90%");
    $("#winamp").css("margin-top","50px");
    $("#playlist").css("width","90%");

    getBBState("getbbplaylist"); // my blackberry foan
    getBBState("getbbstate");    // doesnt understand ajax....or newer js
}

function setupWebSocket() {
    console.log("setupWebSocket()");

    var client = new WebSocket(serverUrl,"winamp");

    client.onmessage = function(_response) {
        console.log("ommessage state received");

        state = JSON.parse(_response.data).state;
        console.dir(state);

        if (state.hasOwnProperty('playList')) {
            playList = state.playList;
            console.log("playlist received length -> " + playList.length);
            populateSelectBox();
            setupSearchAutoComplete();
        }

        if (state.hasOwnProperty('queueSong')) {
            $("#dialog").css("display", "inline-block");
            $("#dialog").html(playList[state.queueSong] + " queued.");
            $("#dialog").hide("drop", { direction: "down" }, 5000);

            delete state.queueSong;
        }

        updateUI();
    } //   client.onmessage = function(_response) {
} 

function charsAllowed(_value) {
    var allowedChars = new RegExp(/^[a-zA-Z\s]+$/);
    return allowedChars.test(_value);
}

function setupSearchAutoComplete() {
    console.log("setupSearchAutoComplete()");

    $("#searchinput").focusin(function() {
        $("#searchinput").css("border", "1px solid #0d0");
        $("body").off("keyup");
        $("#searchinput").val("");

        $("#searchinput").keyup(function(_event) {      
            switch(_event.which) {
                case 13:
                    $("#playlist").focus();
                break;

                case 27: // esc key
                    $("#searchinput").blur();
                break;
            } // switch(_event.which) {
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
            //      console.log("onselect ****");
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
                 // console.log("onfetch ****")
                if (_n.label) 
                    return _n.label.toLowerCase().indexOf(match) !== -1;
            }));
        },
        render: function(_item, _value) {
          //  console.log("onrender ****")
            var itemElement     = document.createElement("div");
            itemElement.id      = "resultrow_";

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
            if (itsTheBlackerry)
                _container.style.maxWidth = "500px";
            
            /* You can use the following snippet to display autocomplete
                above the input field if there is not enough space for it.*/
            if (_maxHeight < 100) {
                    _container.style.top = "";
                    _container.style.bottom = (window.innerHeight - _inputRect.bottom + _input.offsetHeight) + "px";
                    _container.style.maxHeight = "140px";
            } // if (maxHeight < 100) {
        } // customize: function(input, inputRect, container, maxHeight) {
    }) // autocomplete({
} //  setupSearchAutoComplete() {

var customTooltips = function(_tooltip) {
        var index = -1;
        var tooltipEl = document.getElementById('chartjs-tooltip');

        if (!tooltipEl) {
            console.log("creating tooltip")
            
            tooltipEl = document.createElement('div');
            tooltipEl.id = 'chartjs-tooltip';
            tooltipEl.innerHTML = '<table></table>';

            this._chart.canvas.parentNode.appendChild(tooltipEl);
        } // if (!tooltipEl) {

        function getBody(_bodyItem) {
            return _bodyItem.lines;
        }

        if (this._active.length == 0) {
            tooltipEl.style.opacity = 0;
            return;
        }

        index = this._active[0]._index;

        // Hide if no tooltip
        if (!state.songsPlayed.includes(index) || (index == -1) || (!_tooltip.body)) {
            tooltipEl.style.opacity = 0;
            return;
          }

        $("#chart").click(function () {
            $.get("playsong/" + index);
        })

        // Set Text
        console.log("tooltip set text")
        var bodyLines = _tooltip.body.map(getBody);
        var innerHtml = "<thead>";

        // highlight currently playing song
        if (state.songsPlayed[state.songsPlayed.length - 1] == index) {
            $("#tooltiptitle").css("color", "#fd1");
            $(tooltipEl).css("color", "#fd1");
            } else {
                    $("#tooltiptitle").css("color", "#0d0");
                    $(tooltipEl).css("color", "#0d0");
                    }

        innerHtml += '<tr><th id=\"tooltiptitle\">' + playList[index] + '</th></tr>';
        innerHtml += '</thead><tbody>';

        bodyLines.forEach(function(_body, _i) {
            var colors = _tooltip.labelColors[_i];
            var style = 'background:' + colors.backgroundColor;
            style += '; border-color:' + colors.borderColor;    
            style += '; border-width: 2px';
            var span = '<span class="chartjs-tooltip-key" style="' + style + '"></span>';
            innerHtml += '<tr><td>' + span + _body + '</td></tr>';
        });

        innerHtml += '</tbody>';

        var tableRoot = tooltipEl.querySelector('table');
        tableRoot.innerHTML = innerHtml;

        var positionY = this._chart.canvas.offsetTop;
        var positionX = this._chart.canvas.offsetLeft;

        // Display, position, and set styles for font
        tooltipEl.style.opacity     = 1;
        tooltipEl.style.left        = positionX + _tooltip.caretX + 'px';
        tooltipEl.style.top         = positionY + _tooltip.caretY + 'px';
        tooltipEl.style.fontFamily  = _tooltip._bodyFontFamily;
        tooltipEl.style.fontSize    = _tooltip.bodyFontSize + 'px';
        tooltipEl.style.fontStyle   = _tooltip._bodyFontStyle;
        tooltipEl.style.padding     = _tooltip.yPadding + 'px ' + _tooltip.xPadding + 'px';
    };

function setupChart() {
    console.log("setupChart()");
    
    var barColors    = [];
    var chartData    = [];
    var barThickness = [];
    
    chartData.length = playList.length;
     chartData.fill(0);
    barThickness.length = playList.length;
    barThickness.fill(1);

    for (var i =0; i < state.songsPlayed.length;i++) {
        barColors[state.songsPlayed[i]] = document.body.style.color;
        chartData[state.songsPlayed[i]]++;
        }

    // set current playing bar white & 3 wide
    barColors[state.songsPlayed[state.songsPlayed.length - 1]] = "#fd1";
    barThickness[state.songsPlayed[state.songsPlayed.length - 1]] = 4;

    if (chart)
        chart.destroy();
    
    Chart.defaults.global.pointHitDetectionRadius = 1;

    chart = new Chart($("#chart"), {
        type: 'bar',
        data: {
            labels: chartData,
            datasets: [{
                label: 'Played',
                data:  chartData,
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
                        enabled: false, // disable on-canvas false
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
                            callback: function(_value, _index, _values) {
//                                    return _value;
                            }
                        } // ticks: {
                    }], // xAxes: [{
                yAxes: [{
                    ticks: {
                        min: 0,
                            stepSize: 1,
                            callback: function(_value, _index, _values) {
                               // return _value;
                        }
                    }
                }] // yAxes: [{
            } // scales: { 
        } // options: {
    }); //  chart = new Chart(ctx, {
}
 
function getSearchInputSongIndex() {
    for (var i = 0; i < playList.length; i++)
        if (playList[i].includes($("#searchinput").val()))
            return i;
}
