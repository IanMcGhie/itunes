"use strict";
// bb doesnt like the let, includes, const keyword, async functions, promises, ()=> syntax
// ... i dont either
// ooo...neat https://en.wikipedia.org/wiki/Trie
var DEBUG      = true;
var itsTheBB   = true;
var showPlayed = true;
var TEXT       = true;
var newSelect  = false;
var chart;
var userAdjustingProgressBar = false;
var serverUrl  = "winamp:6502";
var playList   = [];
var songLog    = [];
var oldSongLogLength = 0;

var state      = {  volume: 40,
                    duration: 1,
                    progress: 0 };

Number.prototype.toMMSS = function() {    
    var minutes = parseInt(Math.abs(this) / 60);
    var seconds = parseInt(Math.abs(this) % 60);

    if (minutes < 10) 
        minutes = "0" + minutes;
    
    if (seconds < 10)
        seconds = "0" + seconds;

    return minutes + ":" + seconds;
} // Integer.prototype.toMMSS = function() {

var itsFirefox = typeof InstallTrigger !== 'undefined';
var itsChrome  = !!window.chrome && (!!window.chrome.webstore || !!window.chrome.runtime);

if (itsFirefox || itsChrome)
    setupWebSocket(); // this sets itsTheBB to false
        else 
            sendMsg("getstatewithplaylist");


setupClock();
setupTitleTicker();
setupKBEvents();
// window.onresize = drawChart;

function newPopup(_type) {
    log(TEXT, "newPopup(" + _type + ")");

    // create a new div element
   // var currentDiv;

    // and give it some content
/*
if (_type == "mute")
    newDiv.setAttribute('top', '400px');
        else if (_type == "queuesong") 
            newDiv.setAttribute('top', '500px');
                 else if (_type == "pause") 
                    newDiv.setAttribute('top', '600px');
*/
/*
if (_type == "mute")
    if (document.getElementById("mute") != null) {
        const currentDiv = document.getElementById("mute");
        document.body.removeChild(currentDiv);            
    }

if (_type == "queuesong") {
    document.body.insertBefore(newDiv, currentDiv);

    setTimeout(function() {
       const currentDiv = document.getElementById(_type);
       
       document.body.removeChild(currentDiv);
    }, 4000);    
}
*/

    if (_type == "dialog_paused") {
       if (document.getElementById(_type) != undefined) {
            var currentDiv = document.getElementById("winampspan");
           currentDiv = document.getElementById(_type);
           document.body.removeChild(currentDiv);
        } else {
                const newDiv = document.createElement("div");
                const newContent = document.createTextNode("Paused");

                newDiv.appendChild(newContent);
                newDiv.setAttribute('id', _type);

                var currentDiv = document.getElementById("winampspan");
                document.body.insertBefore(newDiv, currentDiv);
           }
    }


/*} else {
            if (!document.getElementById("popupid_" + (popupID))) {
                const currentDiv = document.getElementById("popupid_" + (popupID));
  //              alert(currentDiv);
                document.body.removeChild(currentDiv);            
            }

}*/

}
 /*
if (document.getElementById("popupid_" + (popupID - 1)) == null) {
    // create a new div element
    const newDiv = document.createElement("div");

    // and give it some content
    const newContent = document.createTextNode(_msg);
    // add the text node to the newly created div

    newDiv.appendChild(newContent);
    newDiv.setAttribute('id', 'popupid_' + popupID);
    //newDiv.setAttribute('top', '400px');
    newDiv.setAttribute('top', (400 + (popupID * 100)) +'px' );
    
    const currentDiv = document.getElementById("winampspan");
    document.body.insertBefore(newDiv, currentDiv);
    } else {
//        if () {
        
    if (_delay > 0)  {
        setTimeout(function() {
           const currentDiv = document.getElementById("popup");
            document.body.removeChild(currentDiv);
        }, _delay);
    } else {
//            newDiv.setAttribute('top', (400 + (popupID * 100)) +'px' );
  //      } else {
           const newDiv = document.getElementById("popupid_" + (popupID - 1));
            newDiv.setAttribute('top', (400 + (popupID * 100)) +'px' );
            document.body.removeChild(newDiv);

         }

    }
}
*/


/*

    // add the newly created element and its content into the DOM
  
    if (_delay > 0)  {
        setTimeout(function() {
           const currentDiv = document.getElementById("popup");
            document.body.removeChild(currentDiv);
        }, _delay);
    } else {
            if (!document.getElementById("popup")) {
                const currentDiv = document.getElementById("popup");
  //              alert(currentDiv);
                document.body.removeChild(currentDiv);            
            }
    }*/
  

//} // function newPopup(_msg, _delay) {

function charsAllowed(_value) {
    return new RegExp(/^[a-zA-Z\s]+$/).test(_value);
}

function drawChart(_logMsg) {
    log(TEXT, "drawChart(" + _logMsg + ")");

    var barColors  = [];
    var chartData  = [];
    var lastLetter = "";
    var lastIndex  = -50;
    var yMax       = 0;
    var currentSongIndex = -1;

    var customTooltips = function(_ttModel) {
        var chartToolTip = getAttribs('charttooltip');
        var innerHTML = "<table id='tablerighthere>";
        var chartPopupIndex = -1;

        // Hide if no tooltip
        if (showPlayed && this._active.length == 0) {
        //    getAttribs("charttooltip").remove();
             getAttribs("chartToolTip").removeChild(chartToolTip);
//        getAttribs("charttooltip").display = "none";
            chartPopupIndex = -1;
            return;
        }

        if (!chartToolTip) {
            log(TEXT, "drawChart() -> creating tooltip div")
            chartToolTip = document.createElement('div');
            chartToolTip.id = 'charttooltip';
            chartToolTip.innerHTML = innerHTML;
//            this._chart.canvas.parentNode.appendChild(chartToolTip); // ???
            document.canvas.parentNode.appendChild(chartToolTip); // ???
        }

        chartPopupIndex = this._active[0]._index;

      //  getAttribs("chart").unbind();

        getAttribs("chart").onrightclick = function() { // right click
            getAttribs("charttooltip").remove();
            showPlayed = !showPlayed;
            drawChart("contextmenu");
        };
       
        getAttribs("chart").click(function() {
            if (chartPopupIndex != -1)
                sendMsg("playsong/" + chartPopupIndex);
        });

        // highlight currently playing song
        if (chartPopupIndex == songLog[songLog.length - 1]) { 
            chartToolTip.style.color = "#fd1";
            chartToolTip.style.border = "1px solid #fd1";
            innerHTML += '<thead><tr><th>' + playList[chartPopupIndex] + '</th></tr></thead>';
            } else {
                    chartToolTip.style.color = "#0d0";
                    chartToolTip.style.border = "1px solid #0d0";
                    innerHTML += '<thead><tr><th>' + playList[chartPopupIndex] + '</th></tr></thead>';
                    }

        innerHTML += '<tbody><tr><td>&nbsp<td></tr><tr><td>Right click for songs ' + (showPlayed ? "not" : "") + ' played.</td></tr></tbody></table>';

        chartToolTip.querySelector('table').innerHTML = innerHTML;
        chartToolTip.style.opacity = 1;
        chartToolTip.style.left    = (_ttModel.caretX / 1.4) + 'px';// window.width / 2;// (_ttModel.caretX) + 'px';
    };  // var customTooltips = function(_ttModel) {

    currentSongIndex = songLog[songLog.length - 1];
    chartData.length = playList.length;
    barColors.length = playList.length;
    
    chartData.fill(0);
    barColors.fill(document.body.style.color);

    for (var i = 0; i < playList.length;i++) {
        barColors[songLog[i]] = document.body.style.color;
        chartData[songLog[i]]++;
    }

    yMax = Math.max(chartData);

    for (var i = 0; i < playList.length;i++) {
        if (showPlayed) {            
            if (chartData[i] > 0) {
                barColors[i] = "#0d0";
                chartData[i] = 1;
            }
        } else {
                if (chartData[i] == 0) {
                    barColors[i] = "#0d0";
                    chartData[i] = 1;
                }
            } // } else {
        } // for (var i = 0; i < playList.length;i++) {

    chartData[currentSongIndex] = yMax + 1;
    barColors[currentSongIndex] = "#fd1"; // highlight currently playing

    if (chart)
        chart.destroy();
    
    var chartDiv = getAttribs("chart"); 

    chart = new Chart(chartDiv, {
        type: 'bar',
        data: {
            labels: chartData,
            datasets: [{
                data:  chartData,
                backgroundColor: barColors
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
                        beginAtZero: true,
                        ticks: {
                            autoSkip: false,
                            fontColor: '#0d0',
                            fontSize: '16',
                            callback: function(_value, _index, _values) {
                                    if ((playList[_index].slice(0,1) != lastLetter) && (_index - lastIndex > 40) && (!showPlayed || songLog.includes(_index))) {
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
    }); //  chart = new Chart(getAttribs("chart"), {
} // function drawChart() {

function getAttribs(_id) {
    return document.getElementById(_id);
}

function log(_type, _msg) {
    if (DEBUG) {
        if (_type == TEXT)
            console.log(Date().split('GMT')[0] + _msg);
                else
                    console.log(_msg);
    }
}

function sendMsg(_command) {
    log(TEXT, "sendMsg(" + _command + ")");
 
    var request  = new XMLHttpRequest();

    request.open('GET', '/' + _command, false); // false for synchronous request
    log(TEXT, "sendMsg(" + _command + ") command sent");
    request.send(null); // whats the null for?

    if (_command.split("/")[0] == "queuesong") { // // if (request.response) { 
        log(TEXT, "sendMsg(" + _command + ") already updated UI... returning");
        alert("q dialog goes here...");
        return;
    }
/*
    state = JSON.parse(request.responseText);

    log(!TEXT, state);
 */
    updateUI("sendMsg(" + _command + ")");
} // function sendMsg(_command) {

function setupClock() {
    log(TEXT, "setupClock()");


    setInterval(function() {
        if (!state.pause && state.progress < state.duration) 
            state.progress++;
 
      //  getAttribs('progressbarhandle').style.left = "111px";//(state.duration / state.progress) * -235;
        getAttribs('sliderprogressbar').left = (state.duration / state.progress) * -235;
        getAttribs('clock').innerHTML = "-" + (state.progress - state.duration).toMMSS();
    }, 1000); 
} // function setupClock() {

function setupKBEvents() {
    log(TEXT, "setupKBEvents()");

    document.addEventListener('keyup', (_event) => {
        log(TEXT, "keyup -> " + _event.keyCode);
        
        switch (_event.keyCode) {
            case 13: // CR
                sendMsg("playsong/" + playList.indexOf(getAttribs("searchinput").value));
            break;

            case 90: // Z z
                sendMsg("prev");
            break;

            case 66: // B b
                sendMsg("next");
            break;

            case 77: // M m
                sendMsg("mute");
            break;

            case 67: // c
                sendMsg("pause");
                newPopup("dialog_paused");
            break;

            case 83: // S s
                sendMsg("shuffle");
            break;
/*
you cant do this
            case 81: // Q q
                sendMsg("queuesong/" + playList.indexOf(getAttribs("searchinput").value));
            break;
*/
            case 79: // O o
                state.volume++;
                sendMsg("setvolume/" + state.volume);
                setVolume(state.volume);
            break;

            case 73: // I i
                state.volume--;
                sendMsg("setvolume/" + state.volume);
                setVolume(state.volume);
            break;

            case 74: // J j
                getAttribs('searchinput').focus();
            break;
        } // switch (_event.which) {
    }); // getAttribs("body").keyup(function(_event) {
/*
    document.querySelector("playlist").addEventListener('focus', (_event) => {
alert("in here");
});
*/
/*
const listener = function(e) {
  console.log('focused!'); // do anything here
} 

// Add event listener 
document.getElementById("txttaskdateDeploy").addEventListener("focus", listener);

// When you want to remove the event listener 
document.getElementById("txttaskdateDeploy").removeEventListener("focus", listener);


*/
setTimeout(function() {
//log(TEXT, "setting focus event")
//    getAttribs("playlist").focusin(function() {
getAttribs("playlist").addEventListener('focus', (_event) => {    
/*
        getAttribs("body").off("keyup");
        getAttribs("playlist").css("border", "1px solid #0d0");

        getAttribs("playlist").keyup(function(_event) {
            log(TEXT, "key up -> " + _event.which);

            switch (_event.which) {
                case 13:
                    sendMsg("playsong/" + playList.indexOf(getAttribs("searchinput").value));
                break;
                
                case 51: // 3
                    if (_event.altKey) {
                        log(TEXT, "Hey! alt-3 event captured!");
                        event.preventDefault();
                    }
                break;
            }; // switch (_event.which) {
        }); // getAttribs("#playlist").keyup(function(_event) {
    }); // getAttribs("#playlist").focusin(function() {
*/

    //getAttribs("playlist").focusout(function() {
    getAttribs("playlist").addEventListener('blur', (_event) => {
//        getAttribs("playlist").off("keyup");
  //      getAttribs("playlist").css("border", "1px solid #888");
    //    setupKBEvents();
    });
});
}, 1000);

} // function bodyKBEvents(_event) {

function setupMouseEvents() {
    log(TEXT, "setupMouseEvents()");

//log(!TEXT, getAttribs("playlist"));
/*
    getAttribs("playlist").onclick = function () {
     alert('whoa -> ' + getAttribs('playlist').selectedIndex ); 
 };
*/

    
    window.addEventListener("wheel", function(_event) {
        console.info(_event.deltaY);

        if (_event.deltaY > 0) {
                state.volume--;
     //           sendMsg("setvolume/" + state.volume);
                setVolume(state.volume);
            } else {
                    state.volume++;
          //          sendMsg("setvolume/" + state.volume);
                    setVolume(state.volume);                
                    }
    });

    getAttribs("playlist").ondblclick = function() {

log(!TEXT, getAttribs("playlist"));

        sendMsg((this).id + "/" + playList.indexOf(getAttribs("playlist").selectedIndex));
        //  alert(playList.indexOf(valueOf(getAttribs("playlist").selectedIndex)));
    };

    getAttribs("prev").onclick = function() {
        sendMsg("prev");
    };
  
    getAttribs("pause").onclick = function() {
        sendMsg("pause");
    };
  
    getAttribs("next").onclick = function() {
        sendMsg("next");
    };
  
    getAttribs("shuffle").onclick = function() {
        sendMsg("shuffle");
    };
  
    getAttribs("shuffleenabled").onclick = function() {
        sendMsg("shuffle");
    };

    getAttribs("shuffle").onclick = function() {
        sendMsg("shuffle");
    };

    getAttribs("playlist").onchange = function() {
        //getAttribs("searchinput").val(getAttribs("playlist").val());
    };
  
  
/*    // this will cause slidechange jquery cb to fire
    getAttribs("#winampspan").on("wheel", function(_event) {
        if (_event.originalEvent.deltaY < 0)
            getAttribs("#volume").slider("value",parseInt(getAttribs("#volume").slider("value") + 1)); 
                else
                   getAttribs("#volume").slider("value",parseInt(getAttribs("#volume").slider("value") - 1));
    });
*/
/*
    getAttribs("#progressbarhandle").draggable({
       containment: "parent",
       start: function() {
            userAdjustingProgressBar = true;
        },
        stop: function(_event, _ui) {
            sendMsg("seek/" + (state.progress / state.duration) * 100);

            userAdjustingProgressBar = false;
        }  
    });

    getAttribs("#playlist").change(function() {
        getAttribs("#searchinput").val(getAttribs("#playlist").val());
    });

    getAttribs("#playlist").dblclick(function() {
        sendMsg("playsong/" + playList.indexOf(getAttribs("searchinput").value));
    });'*/
} // function setupMouseEvents() {

function setupPlayList() {
    log(TEXT, "setupPlayList()");

    playList = state.playList;

    if (playList.length < 20)
        getAttribs("playlist").size = playList.length;
    
    for (var i = 0; i < playList.length; i++) {
        var select = getAttribs("playlist");
        var option = document.createElement("option");
                 
        option.setAttribute("id", i);
        option.text = playList[i];
        select.add(option);
    } 

    log(TEXT, "setupPlaylist() " + playList.length + " songs in playList. removing playList from state");

    delete state.playList;
} // function setupPlaylist() {

function setupSearch() {
    log(TEXT, "setupSearch()");
      getAttribs("searchinput").focus(function() {
        alert("focusin");
      });
/*
    getAttribs("#searchinput").focusin(function() {
        getAttribs("body").off("keyup");
        getAttribs("#searchinput").css("border", "1px solid #0d0");
          
        if (!newSelect) 
            getAttribs("#searchinput").val("");
                else
                    newSelect = false;
        
        getAttribs("#searchinput").keyup(function(_event) {      
            if (_event.which == 13) {
                sendMsg("playsong/" + playList.indexOf(getAttribs("searchinput").value));
              getAttribs("#searchinput").blur();
                newSelect = false;
            }

            if (_event.which == 27)
                getAttribs("#searchinput").blur();
        }); // getAttribs("#searchinput").keyup(function(_event) {      
    }); // getAttribs("#searchinput").focusin(function() {

    getAttribs("#searchinput").focusout(function() {
        getAttribs("#searchinput").css("border", "1px solid #888");
        getAttribs("#searchinput").off("keyup");
        getAttribs("#searchinput").val(getAttribs("#playlist").val());
        setupKBEvents();
    }); // getAttribs("#searchinput").focusout(function() {

*/
//    getAttribs("searchinput").outerHTML = getAttribs("playlist").innerHTML;


    autocomplete({  // preventSubmit: true,
        input: document.querySelector('#searchinput'),
        className: 'autocomplete-customizations',
        minLength: 2, //debounceWaitMs: 50,
        emptymessage: "MP3 not found",
        onSelect: function(_item, _inputfield) { // log(LOG,"onselect ****");
            newSelect = true;
            getAttribs("#searchinput").val(_item.label);
        },
        fetch: function(_match, _callback) {
            var match   = _match.toLowerCase();
            var items   = playList.map(function(_n) {
                return { label: _n, group: "Results" }
            });
            _callback(items.filter(function(_n) { // log(LOG,"onfetch ****")
                if (_n.label) {
                    return _n.label.toLowerCase().indexOf(match) !== -1;
                }
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
        customize: function(_input, _inputRect, _container, _maxHeight) {
            if (_maxHeight < 100) { // // display autocomplete above the input field if there is not enough space for it.
                _container.style.top = "";
                _container.style.bottom = (window.innerHeight - _inputRect.bottom + _input.offsetHeight) + "px";
                _container.style.maxHeight = "140px";
            } // if (maxHeight < 100) {
        } // customize: function(input, inputRect, container, maxHeight) {
    }) // autocomplete({
} //  setupSearch() {

function setupTitleTicker() {
    log(TEXT, "setupTitleTicker()");

    setInterval(function() {
        var pageTitleDiv = getAttribs('pagetitle');

        if (pageTitleDiv.text.length > 0)
            pageTitleDiv.innerHTML = pageTitleDiv.innerHTML.slice(1);
                else
                    pageTitleDiv.innerHTML =  playList[songLog[songLog.length - 1]];
    }, 250);
} // function setupTitleTicker() {

function setupWebSocket() {
    log(TEXT, "setupWebSocket()");
    
    var client = new WebSocket("ws://" + serverUrl, "winamp");
    
    itsTheBB = false; // this sets itsTheBB to false

    client.onmessage = function(_message) {
        log(TEXT, "WS onmessage CB() recieved");

        if (_message.data != undefined)
            state = JSON.parse(_message.data).state;

        log(!TEXT, state);
        
        updateUI("WS onmessage CB() recieved");
    } // client.onmessage = function(_message) {
} // function setupWebSocket() 

function setVolume() {
    log(TEXT, "setVolume()");

   // getAttribs("volume")
    /*


            // vol 0% -> 40 153 28  vol 100% -> 225 31 38
            //           28  99 1c               e1 1f 26 
            var r = toHex(_ui.value * 1.85 + 40);
            var g = toHex(153 - _ui.value);
            var b = toHex(_ui.value * 0.1 + 28);

            getAttribs("#volume").css("background-color","#" + r + g + b);            


*/
}

function toHex(_n) {
    var h = parseInt(_n).toString(16);
    return h.length < 2 ? "0" + h : h;;
}

function updateUI(_logMsg) {
    log(TEXT, "updateUI(" + _logMsg + ")");

    if (state.hasOwnProperty('songLog')) 
        songLog = state.songLog;

    if (state.hasOwnProperty('playList')) {
        setupPlayList();
        setupSearch();
    }

setupMouseEvents();

    if (songLog.length != oldSongLogLength) { // new song ...update chart
        oldSongLogLength = songLog.length;
        drawChart("updateUI");
    }

    if (state.pause)
        getAttribs("paused").src = "images/paused.png";
            else
                getAttribs("paused").src = "images/playing.png";
    
    getAttribs("shuffleenabled").hidden     = !state.shuffle;
    getAttribs("songtitle").innerHTML       = playList[songLog[songLog.length - 1]] + " (" + state.duration.toMMSS() + ")";
//    getAttribs("mutedialog").hidden         = !state.mute; 
    getAttribs("playlist").selectedIndex    = songLog[songLog.length - 1];
    getAttribs("searchinput").size          = 125;
    getAttribs("searchinput").value         = playList[getAttribs("playlist").selectedIndex];
    getAttribs("connections").innerHTML     = " (" + state.totalListeners + "/" + state.currentListeners + "/" + songLog.length + ")";

//    getAttribs("#mutedialog").css("display", state.mute ? "inline-block" : "none");

document.getElementById("shuffleenabled").left = "100px";

    if (itsTheBB) {
        getAttribs("body").css("text-align","left");
        getAttribs("songtitle").css("width","45%");
        getAttribs("shuffleenabled").css("margin-left", "-190px");
/*        getAttribs("mutedialog").css("left","5%");
        getAttribs("mutedialog").css("top","35%");
        getAttribs("popupdialog").css("top","30%");
        getAttribs("popupdialog").css("left","0px");
        getAttribs("popupdialog").css("width","40%");*/
    }

// fix this  
//    if (state.hasOwnProperty('volume'))
//        getAttribs("#volume").slider("value", state.volume); // this will cause slidechange jquery cb to fire

    if (state.hasOwnProperty('popup')) {
        log(TEXT, "updateUI(" + _logMsg + ") removing popupdialog from state");
/*
        getAttribs("popup").css("display", "inline-block");
        getAttribs("popup").text(state.popupdialog);
        getAttribs("popup").delay(5000).hide(0);  
  */      
        delete state.popupdialog;
    } 
} // function updateUI(_logMsg) {
