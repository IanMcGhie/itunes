module.exports = class Queue { 
    // Array is used to implement a Queue 
    constructor(_debug) { 
        const Logger    = require('./Logger');
        this.log        = new Logger(_debug);
        this.items      = [];
        this.id         = 0;
    } 
                  
    async enQueue(_element) {     
        // adding element to the queue 
        _element.id = this.id++;
        this.items.push(_element);
        this.printQueue();
        this.deQueue();
    } 

    deQueue() { 
        if(this.isEmpty()) 
            return 'Underflow'; 
        
//        return this.sendState();
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
        this.log.text('sendState()');

        if (this.items.length == 0 || this.front().clients == 0) {
            this.log.text('sendState() items in queue -> ' + this.front().clients.length + ' clients connected -> ' + this.front().clients);
            return;
        }

    //    this.logger.log('TEXT','typeof queue msg -> ' + JSON.parse(this.items[0]).command);

 //      getXmmsState().then(() => {
            for (let i = 0; i < this.front().clients.length; i++)
//                for(let j = 0; j < this.items[i].clients.length; j++) {

                    if (!this.front().clients[i].remoteAddress || _broadcast == 'BROADCAST') {
                        this.log.text('sendState() sending state to -> ' + this.items[i].clients[j].remoteAddress);
                        this.front().clients[i].sendUTF(this.items[i]);
                        } else
                            this.log.text('sendState() NOT sending state to -> ' + this.items[i].clients[j].remoteAddress);
  //              }
/*
            if (this.front().state.hasOwnProperty('queuesong')) {
                this.log.text('sendState() removing queuesong from state');
                delete mState.queuesong;
            }
*/
      //  });        

        this.log.text('removing queue id #' + this.items[0].id + ' from queue. ')
        this.items.shift();

        if (this.items.length > 0)
            printQueue();
        
        return this.items; 

    }

    isEmpty() { 
        return this.items.length == 0; 
    } 

    printQueue() { 
//        var str = ''; 
        
//        for(var i = 0; i < this.items.length; i++) 
  //          str += this.items[i] + ' '; 

        this.log.text(this.items.length + ' items queued');
        this.log.obj(this.items);
    } 
} 
 