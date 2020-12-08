let TEXT = true;

module.exports = class Queue { 
    // Array is used to implement a Queue 
    constructor(_debug) { 
        this.items = [];
        this.id    = 0;
        this.debug = _debug;
    } 
                  
     enQueue(_element) {     
        log(TEXT, "queueing _element -> " + _element.command + " id -> " + this.id);

        _element.id = this.id++;

        this.items.push(_element);
        this.printQueue();

        return this;
    } 

    sendState(_clients) {
        log(TEXT, 'Queue.sendState()');
        
        if (this.items.length == 0)  {
            log(TEXT, "no items in queue... returning");
            return; 
        }
        
        if (_clients.length == 0){
            log(TEXT, 'sendState() no connections... returning');
        }

        log(TEXT, 'sendState() items in queue -> ' + this.items.length + ' clients connected -> ...not sure');
            for (let i = 0; i < _clients.length; i++) {
                if (!_clients[i]) {
                    log(TEXT, 'sendState() sending state to -> ' + _clients[i]);
                    clients[i].send(JSON.stringify({state: state}));
                    } else {
                            log(TEXT, 'sendState() NOT sending state to -> ' + _clients[i]);
                            }
                }

        log(TEXT, 'removing queue id #' + this.items[0].id + ' from queue. ')
        this.items.shift();

        if (this.items.length > 0)
            printQueue();
        
     //   return this.items 
    } // sendState(_clients) {

    isEmpty() { 
        return this.items.length == 0; 
    } 

    printQueue() { 
        log(TEXT, this.items.length + ' items queued');
        log(!TEXT, this.items);
    } 

} 
 
 function log(_type, _msg) {
    if (this.debug) {
        if (_type == TEXT)
            console.log(Date().split('GMT')[0] + _msg);
                else
                    console.log(_msg);
    }
}
