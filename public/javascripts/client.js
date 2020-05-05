"use strict";
// bb doesnt like the const keyword
var serverUrl   = "ws://winamp:6502";
var state       = {};
var playList    = [];
var itsTheBlackerry = false;
var chart;

$(document).ready(function() {
    var itsNotFirefox = typeof InstallTrigger === 'undefined';
    var itsNotChrome = !(!!window.chrome && (!!window.chrome.webstore || !!window.chrome.runtime));

    itsTheBlackerry = itsNotFirefox && itsNotChrome;

    if (itsTheBlackerry) 
        setupBlackerry(); // sync ui
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
    console.log("setupTicker(" +  _delayMs + ")");

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
    /*
    $("#pause").on("click", function () {
        $.get("pause");

        if (itsTheBlackerry)
            state.paused = !state.paused; 
    })
*/
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

    $("#prev,#pause,#next,#shuffle,#timeremaining").click(function() { 
        $.get((this).id); 

        if (itsTheBlackerry && ((this).id == 'pause')) {
            state.paused = !state.paused; 
      //      getBBState("getbbstate");
      updateUI();
}
     });

    $("#queuesong").click(function() {
        if (itsTheBlackerry) {
            $("#popupdialog").css("display", "inline-block");
            $("#popupdialog").html($("#searchinput").val() + " queued.");
            $("#popupdialog").hide("drop", { direction: "down" }, 10000);
        } 

        $.get("queuesong/" + getSearchInputSongIndex());
    });

    $("#playsong").click(function() {
        if (itsTheBlackerry) {
            getBBState("playsong");
             $.getJSON(_getWhat, function(_state) {
                state = _state;
                updateUI();
            });
               } else
                    $.get("playsong/" + getSearchInputSongIndex());
    });
    
    $("#playlist").dblclick(function() {
        $.get("playsong/" + getSearchInputSongIndex());
    });
} // function setupMouseEvents() {

function setupPlayListKBEvents() {
    $("#playlist").focusin(function () {
        $("body").off("keypress");
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
//   $("body").keyup(function(_event) {
    $("body").keypress(function(_event) {
        console.log("keypress -> " + _event.which);
        
        switch (_event.which) {
            case 122: // z
                $.get("prev");
                
                if (itsTheBlackerry) 
                    getBBState("getbbstate");
            break;

            case 98: // b
                $.get("next");

                if (itsTheBlackerry)
                   getBBState("getbbstate");
            break;

            case 111: // o
                state.volume++;
                setVolume();
            break;

            case 105: // i
                state.volume--;
                setVolume();
            break;

            case 106: // j
                $("#searchinput").focus();
            break;

            case 99: // c
                $.get("pause");
                state.paused = !state.paused;
            break;

            case 115: // s
                $.get("shuffle");

                if (itsTheBlackerry)
                    getBBState("getbbstate")
            break;

            case 113: // q
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

    if (state.paused)
        $("#ispaused").attr("src","/images/ispaused.png");
            else
                $("#ispaused").attr("src","/images/isplaying.png");

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
            console.log("Queueing song #" + state.queueSong + " -> " + playList[state.queueSong]);

            $("#popupdialog").css("display", "inline-block");
            $("#popupdialog").html(playList[state.queueSong] + " queued.");
            $("#popupdialog").hide("drop", { direction: "down" }, 10000);

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

function setupChart() {
    var chartData    = [];

    console.log("setupChart()");

    var customTooltips = function(_ttModel) {
        var index = -1;
        var ttElement = document.getElementById('chartjs-tooltip');

        if (!ttElement) {
            console.log("creating tooltip div")
            
            ttElement = document.createElement('div');
            ttElement.id = 'chartjs-tooltip';
            ttElement.innerHTML = '<table></table>';

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

        // Hide if no tooltip
        if (!state.songsPlayed.includes(index) || (index == -1) || (!_ttModel.body)) {
            ttElement.style.opacity = 0;
            return;
        }

        $("#chart").click(function () {
            $.get("playsong/" + index);
        })

        // Set Text
        console.log("tooltip set text")
        var bodyLines = _ttModel.body.map(getBody);
        var innerHtml = "";

    //var ttWidth = parseInt($(ttElement).css("left")); - parseInt($(ttElement).css("right"));// - $(ttElement).css("height");
    var ttWidth = parseInt($(ttElement).css("left")) + (parseInt($(ttElement).css("width")) / 2);
    var mouseX = _ttModel.caretX;
    var ttLeft =  parseInt($(ttElement).css("left"));
    var ttCentreXMin   = (ttWidth / 2); // far left  min
    var ttCentreXMax   = ttLeft + (ttWidth / 2); // far right max
    var dbstr = "false";

    //$(ttElement).css("width",500);

    if (dbstr != "false")
        if ((mouseX < ttCentreXMax) && (mouseX > ttCentreXMin)) {
            dbstr = "don't adjust";
        } else
            dbstr = "adjust";

        // highlight currently playing song
        if (state.songsPlayed[state.songsPlayed.length - 1] == index) {
            $(ttElement).css("color", "#fd1");
            $(ttElement).css("border", "1px solid #fd1");
            innerHtml += '<tr><th>Currently Playing:</th></tr>';
            innerHtml += '<tr><th>' + playList[index] + '</th></tr>';
            } else {
                    $(ttElement).css("color", "#0d0");
                    $(ttElement).css("border", "1px solid #0d0");
                    innerHtml += '<tr><th>' + playList[index] + '</th></tr>';
                    innerHtml += '<tr><td>Played: ' + chartData[index] + '</td></tr>';
           if (dbstr != "false") {
                    innerHtml += '<tr><td>windowWidth: ' + window.innerWidth + '</td></tr>';
                    innerHtml += '<tr><td>ttLeft: ' + parseInt($(ttElement).css("left")) + '</td></tr>';
                    innerHtml += '<tr><td>ttWidth: ' + ttWidth + '</td></tr>';
                    innerHtml += '<tr><td>mouseX: ' +  mouseX + '</td></tr>';
                    innerHtml += '<tr><td>Adjust: ' + dbstr + '</td></tr>';
                }
                    innerHtml += '<tr><td>Click to play</td></tr>';
                    }

        var tableRoot = ttElement.querySelector('table');
        tableRoot.innerHTML = innerHtml;

        ttElement.style.opacity     = 1;
    //    ttElement.style.left        = ( _ttModel.caretX) + 'px';
        ttElement.style.left        = (mouseX) + 'px';
        ttElement.style.fontFamily  = _ttModel._bodyFontFamily;
        ttElement.style.fontSize    = _ttModel.bodyFontSize + 'px';
        ttElement.style.fontStyle   = _ttModel._bodyFontStyle;
    };  // var customTooltips = function(_ttModel) {

    var barColors    = [];
    var barThickness = [];
    
    chartData.length = playList.length;
    chartData.fill(0);
    barThickness.length = playList.length;
    barThickness.fill(1);

    for (var i =0; i < state.songsPlayed.length;i++) {
        barColors[state.songsPlayed[i]] = document.body.style.color;
        chartData[state.songsPlayed[i]]++;
        }

    // highlight current playing & 6 wide
    barColors[state.songsPlayed[state.songsPlayed.length - 1]] = "#fd1";
    barThickness[state.songsPlayed[state.songsPlayed.length - 1]] = 6;

    if (chart)
        chart.destroy();
    
    Chart.defaults.global.pointHitDetectionRadius = 1;

    chart = new Chart($("#chart"), {
        type: 'bar',
        data: {
            labels: chartData,
            datasets: [{
             /*   label: 'Played',*/
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
