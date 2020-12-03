module.exports = class Queue { 
    // Array is used to implement a Queue 
    constructor(_debug) { 
        const Logger    = require('./Logger');
        this.log        = new Logger(_debug);
        this.items      = [];
        this.id         = 0;
    } 
                  
    async enQueue(_element) {     
        if (_element != undefined) {
            this.log.text('new song not pushing this into queue _element -> ' + _element);
            return;
        }

    /*    if (_element.command == "newsong") {
            this.log.text('new song not pushing this into queue');
            return;
        }*/

        _element.id = this.id++;

        console.log("queueing _element -> " + _element.command + " id -> " + this.id);

        this.items.push(_element);
        this.printQueue();
        this.deQueue();
    } 

    deQueue() { 
        if(this.isEmpty()) 
            return 'Underflow'; 
        
        this.sendState();
    } 

    front() { 
        // returns the Front element of  
        // the queue without removing it. 
        if(this.isEmpty()) 
            return 'No elements in Queue'; 
        
        return this.items[0]; 
    } 
  
    sendState(_broadcast) {
        this.log.text('Queue.sendState()');

        if (!this.items) {
            this.log.text('sendState() queue is empty... returning');
            return;
        }

        if (!this.clients){
            this.log.text('sendState() queue is empty... returning');
        }

        this.log.text('sendState() items in queue -> ' + this.front().clients.length + ' clients connected -> ' + this.front().clients);
            for (let i = 0; i < this.front().clients.length; i++) {
                    if (!this.front().clients[i].remoteAddress || _broadcast == 'BROADCAST') {
                        this.log.text('sendState() sending state to -> ' + this.items[i].clients[j].remoteAddress);
                        this.front().clients[i].sendUTF(this.items[i]);
                        } else {
                            this.log.text('sendState() NOT sending state to -> ' + this.items[i].clients[j].remoteAddress);
                        }
                }

/*
            if (this.front().state.hasOwnProperty('queuesong')) {
                this.log.text('sendState() removing queuesong from state');
                delete mState.queuesong;
            }
*/
        this.log.text('removing queue id #' + this.items[0].id + ' from queue. ')
        this.items.shift();

        if (this.items.length > 0)
            printQueue();
        
        return this.items 
    }

    isEmpty() { 
        return this.items.length == 0; 
    } 

    printQueue() { 
        this.log.text(this.items.length + ' items queued');
        this.log.obj(this.items);
    } 
} 
 