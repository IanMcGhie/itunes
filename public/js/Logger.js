"use strict";

module.exports = class Logger { 
    constructor(_debug) {
    	this.DEBUG = _debug;
    } 
         
	text(_msg) {
		if (this.DEBUG)
				console.log(Date().split('GMT')[0] + _msg);
	} 

	obj(_msg) {
		if (this.DEBUG)
				console.log(_msg);
	} 
}
