class EPS16 {
    inputs = []
    outputs = []
    constructor(setUpCallback, errorCallback){
        this.inputs = []
        this.outputs = []
        this.instNum = 0
        this.layerNum = 0
        this.wsBytes = [0x00, 0x01]
        this.midiInput = NaN
        this.midiOutput = NaN
        this.midiMessages = []
        this.setUpCallback = setUpCallback
        this.errorCallback = errorCallback
        navigator.requestMIDIAccess({sysex: true}).then( (midiAccess) => {
            for(let input of midiAccess.inputs.values()){
                this.inputs.push(input)
            }
            for(let output of midiAccess.outputs.values()){
                this.outputs.push(output)
            }
            this.setUpCallback(this.inputs, this.outputs)

        }, this.onMIDIFailure);

    }
    /***
     * EPS Sysex Commands
     */
    async getWavesampleParams(){
        let cmd = this.createMIDIMessage(0x05)
        this.sendData(cmd);
        let messages = await this.readMessages()
        for(let msg of messages){
            if(this.isAck(msg)){
                this.sendAck()
                let responses = await this.readMessages()
                for(let resp of responses){
                    return this.convertFrom16BitMidi(resp, true)
                }
            }
        }
        return []
        
    }
    async deleteInstrument(){
        const msg = this.createMIDIMessage(0x1C)
        this.sendData(msg)
        let messages = await this.readMessages()
        if(this.isAck(messages[0])){
            console.log("Deleted instrument")
        }else{
            console.log("Error Deleting instrument")
        }
    }
    sendAck(){
        const data = [
            0x01,
            0x00,
            0x00
        ]
        this.sendData(data) 
    }
    async createInstrument(){
        let message = this.createMIDIMessage(0x15)
        this.sendData(message)
        let messages = await this.readMessages()
        if(this.isAck(messages[0])){
            console.log("Created instrument")
            return true
        }else{
            console.log("Error Creating instrument")
            return false
        }

    }
    async createLayer(){
        let message = this.createMIDIMessage(0x16)
        this.sendData(message)
        let messages = await this.readMessages()
        if(this.isAck(messages[0])){
            console.log("Created Layer")
            return true
        }else{
            console.log("Error Creating Layer")
            return false
        }
    }
    async createSqrWave(){
        let message = this.createMIDIMessage(0x19)
        this.sendData(message)
        let messages = await this.readMessages()
        if(this.isAck(messages[0])){
            console.log("Created SQR")
            return true
        }else{
            console.log("Error Creating SQR wavesample")
            return false;
        }
    }
    async clearWavesample(){
        let params = this.getWavesampleParams()
        let length = this.getEndOffset(params)
        let offsets = this.convertTo12BitMidi([length])
        let data = [
            0x00, // start offset
            0x00, // start offset
            0x00, // start offset
            0x00, // start offset
        ]
        data.concat(offsets)
        let cmd = this.createMIDIMessage(0x1f, data)
        this.sendData(cmd)
        let messages = await this.readMessages()
        if(this.isAck(messages[0])){
            console.log("Cleared WaveSample")
            return true
        }else{
            console.log("Error Clearing wavesample")
            return false
        }

    }
    async truncateWavesample(){
        let cmd = this.createMIDIMessage(0x1E)
        this.sendData(cmd)
        let messages = await this.readMessages()
        if(this.isAck(messages[0])){
            console.log("Trucnated WaveSample")
            return true
        }else{
            console.log("Error truncating wavesample")
            return false
        }
    }
    async getWavesampleData(){
        let params = await this.getWavesampleParams()
        let offset = this.getEndOffset(params)
        let offsets = this.convertTo12BitMidi([offset],4)
        let sampleOffsets = [
            0x00, // start offset
            0x00, // start offset
            0x00, // start offs2et
            0x00, // start offset
        ]
        sampleOffsets = sampleOffsets.concat(offsets)
        let cmd = this.createMIDIMessage(0x06, sampleOffsets)
        this.sendData(cmd)
        await this.sleep(2000)
        let responses = await this.readMessages()
        for(let resp of responses){
            if(this.isAck(resp)){
                this.sendAck()
                let messages = await this.readMessages()
                for(let msg of messages){
                    if(msg.length > 4){
                        let waveData = this.convertFrom16BitMidi(msg)
                        for(let i=0; i<waveData.length; i++){
                            waveData[i] = this.convertToSignedInt(waveData[i]) 
                        }
                        return waveData
                    }
                }

            }
        }
        return []
    }
    setParameter(paramGroup, paramByte, paramValue){
        let header = [paramGroup, paramByte]
        let midiValue = this.convertTo12BitMidi([paramValue],4)
        let msg = header.concat(midiValue)
        let cmd = this.createMIDIMessage(0x11,msg)
        this.sendData(cmd)
    }
    async putWavesampleData(audio){
        let midiData = this.convertTo16BitMidi(audio)
        let offsets = this.convertTo12BitMidi([audio.length], 4)
        let sampleOffsets = [
            0x00, // start offset
            0x00, // start offset
            0x00, // start offset
            0x00, // start offset
        ]
        sampleOffsets = sampleOffsets.concat(offsets)
        let cmd = this.createMIDIMessage(0x0f,sampleOffsets)
        this.sendData(cmd)
        let messages = await this.readMessages()
        for(let msg of messages){
            if(this.isAck(msg)){
                this.sendData(midiData)
                let responses = await this.readMessages()
                responses.forEach( (resp) => {
                    if(this.isAck(resp)){
                        this.setParameter(0x20, 0x18, audio.length)
                        return true
                    }
                })
            }
        }
        return false


    }

    async uploadWavToEPS(audio){
        //if(!await this.createSqrWave()) return false
        //await this.sleep(500)
        this.setParameter(0x20, 0x00, 2) // set loop forward
        await this.sleep(200)
        this.setParameter(0x20, 0x19, 0) // set loop pos
        await this.sleep(200)
        this.setParameter(0x20, 0x17, 0) // set loop start
        await this.sleep(200)
        this.setParameter(0x20, 0x18, 1) // set loop end
        await this.sleep(200)
        this.setParameter(0x20, 0x15, 0) // set sample start
        await this.sleep(200)
        this.setParameter(0x20, 0x16, 1) // set sample end
        await this.sleep(200)
        if(!await this.truncateWavesample()) return false
        await this.sleep(500)
        await this.readMessages()
        await this.putWavesampleData(audio)
    }
    /**
     * Utility Commands for midi data coversions
     */
    convertToSignedInt(data){
        if(data > 32767) {data = data - 65536;}
        return data
    }
    saveFile(samples, sampleRate=44100){
        // Stolen from Recorder.js
        // https://github.com/mattdiamond/Recorderjs
        let buffer = new ArrayBuffer(44 + samples.length * 2);
        let view = new DataView(buffer);
        /* RIFF identifier */
        this.writeString(view, 0, 'RIFF');
        /* RIFF chunk length */
        view.setUint32(4, 36 + samples.length * 2, true);
        /* RIFF type */
        this.writeString(view, 8, 'WAVE');
        /* format chunk identifier */
        this.writeString(view, 12, 'fmt ');
        /* format chunk length */
        view.setUint32(16, 16, true);
        /* sample format (raw) */
        view.setUint16(20, 1, true);
        /* channel count */
        view.setUint16(22, 1, true);
        /* sample rate */
        view.setUint32(24, sampleRate, true);
        /* byte rate (sample rate * block align) */
        view.setUint32(28, sampleRate * 4, true);
        /* block align (channel count * bytes per sample) */
        view.setUint16(32, 1 * 2, true);
        /* bits per sample */
        view.setUint16(34, 16, true);
        /* data chunk identifier */
        this.writeString(view, 36, 'data');
        /* data chunk length */
        view.setUint32(40, samples.length * 2, true);
        let offset = 44
        for(let i=0; i<samples.length; i++, offset +=2){
            view.setInt16(offset, samples[i], true)
        }
        let audioBlob = new Blob([view], {type: 'audio/x-wav'});
        let url = (window.URL || window.webkitURL).createObjectURL(audioBlob);
        let link = window.document.createElement('a');
        link.href = url;
        link.download = 'output.wav';
        link.innerHTML="Download"
        link.click();
    }
    parseWavFile(buffer){
        let view = new DataView(buffer)
        let length = (view.getUint32(4,true) - 36)/2
        if(view.getUint16(22, true) != 1){
            alert("Only Mono Files allowed")
            return;
        }
        if(length > 512900){
            alert("file too big")
            return
        }
        let audio = []
        let offset=44
        for(let i=0; i<length; i++, offset +=2){
            audio.push(view.getInt16(offset, true))
        }
        return audio
    }
    writeString(view, offset, string) {
        for (let i = 0; i < string.length; i++) {
            view.setUint8(offset + i, string.charCodeAt(i));
        }
    }
    isAck(message){
        return message[message.length-1] == 0
    }
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
    async readMessages(){ 
        let readMessages = []
        const startTime = Date.now()
        let timeout=0;
        while(this.midiMessages.length == 0 &&  timeout < 10000){
            timeout = Date.now() - startTime;
            await this.sleep(100)
        }
        while(this.midiMessages.length > 0){
            const msg = this.midiMessages.pop()
            const striped = this.stripSysexHeader(msg)
            readMessages.push(striped)
        }
        return readMessages
    }
    onMIDIFailure() {
        alert('Could not access your MIDI devices.');
    }
    stripSysexHeader(message){
        let sliced = message.slice(4,message.length -1)
        return sliced
    }
    setInput(value){
        this.input = value
        this.midiInput = this.inputs.find((input) => input.name == this.input)
        this.midiInput.onmidimessage = (midiMessage) => {
            console.log(midiMessage)
            if(midiMessage.data[0] == 0xF0){ //Sysex Data
                this.midiMessages.push(midiMessage.data)
            }
            if(midiMessage.data[4] == 0x1){
                let message = this.getResponseMessage(this.stripSysexHeader(midiMessage.data))
                if(message.indexOf("Error") != -1){
                    this.errorCallback(message)
                }
                console.log(message)
            }
        }
    }
    setOutput(value){
        this.output = value
        this.midiOutput = this.outputs.find((output) => output.name == this.output)
    }
    sendData(message){
        let packet = [
            0xF0,
            0x0F,
            0x03,
            0x00
        ]
        packet = packet.concat(message)
        packet.push(0xf7)
        this.midiOutput.send(packet)

    }
    createMIDIMessage(command, data=[]){
        let header = [
            command,
            0x00,
            this.instNum,
            0x00,
            this.layerNum,
        ].concat(this.wsBytes)
        let msg = header.concat(data)
        console.log(msg)
        return msg
    }
    getResponseMessage(message){
        const code = message[2]
        switch(code){
            case 0x00: return "SUCCESS: ACK"
            case 0x01: return "INFO: WAIT" 
            case 0x02: return "Error: Insert System Disk"
            case 0x03: return "Error: Invalid Param Number"
            case 0x04: return "Error: Invalid Param Value"
            case 0x05: return "Error: Invalid Instrument"
            case 0x06: return "Error: Invalid Layer"
            case 0x07: return "Error: Layer In Use"
            case 0x08: return "Error: Invalid Wavesample"
            case 0x09: return "Error: Wavesample in Use"
            case 0x0a: return "Error: Invalid Wavesammple data range"
            case 0x0b: return "Error: File Not Found"
            case 0x0c: return "Error: Memory Full"
            case 0x0d: return "Error: Instrument in Use"
            case 0x0e: return "Error: No More Layers"
            case 0x0f: return "Error: No More Samples"
            case 0x10: return "Error: reserved"
            case 0x11: return "Error: Wavesample is a copy"
            case 0x12: return "Error: Zone Too Big"
            case 0x13: return "Error: Sequencer Must Be Stopped"
            case 0x14: return "Error: Disk Access in Progress"
            case 0x15: return "Error: Disk Full"
            case 0x16: return "Error: Loop is too long"
            case 0x17: return "Error: NAK"
            case 0x18: return "Error: No Layer To Edit"
            case 0x19: return "Error: No More Pitch Tables"
            case 0x1a: return "Error: Cross Fade length is zero"
            case 0x1b: return "Error: Cross Fade Length is greater than 50%"
            case 0x1c: return "Error: Loop Start is to close to sample start"
            case 0x1d: return "Error: Loop End is to close to sample end"
            case 0x1e: return "Error: Quiet Layer"
            default: return "Unknown!"
        }
    }

    convertTo12BitMidi(data, minSize=2){
        let binString = ''
        for( let byte of data){
            binString += byte.toString(2).padStart(16,0)
        }
        while(binString.length%12 != 0){
            binString = binString.substring(1)
        }
        let stop = binString.length/6
        console.log(stop)
        let midiArray = []
        for(let i=0; i<stop; i++){
            let last6Bits = binString.substring(binString.length - 6, binString.length)
            binString = binString.substring(0, binString.length -6)
            midiArray.push(parseInt(last6Bits,2))
        }
        console.log(midiArray)
        while(midiArray.length < minSize){
            midiArray.push(0)
        }
        midiArray.reverse()
        return midiArray
        
    }
    convertTo16BitMidi(data){
        for(let i=0; i<data.length;i++){
            data[i] = data[i] +2**16
        }
        let midiArray=[]
        for(let byte of data){
            let byte3 = byte & 0x003F
            let byte2 = (byte & 0x00C0) >> 6
            byte2 = (byte & 0x0F00) >> 6 | byte2
            let byte1 = (byte & 0xF000) >> 12
            midiArray.push(byte1)
            midiArray.push(byte2)
            midiArray.push(byte3)
        }
        return midiArray
    }
    convertFrom16BitMidi(data){
        let midiArray=[]
        for(let i=0; i< data.length; i=i+3){
            const word = (data[i]&0x0F) << 12  |  (data[i+1]&0x3F) << 6  | data[i+2] &0x3F
            midiArray.push(word)
        }
        return midiArray
    }
    getEndOffset(bit16Params){
        let word1 = bit16Params[119] << 16
        let word2 = bit16Params[120] << 8
        let word3 = bit16Params[121]
        let word4 = bit16Params[122] >> 8
        let offset = (word1 | word2 |  word3 | word4) >> 9
        return offset
    }
    setInstrumentNumber(num){
        this.instNum = num
    }
    setLayerNumber(num){
        this.layerNum = num
    }
    setWavesampleNumber(num){
        this.wsBytes = this.convertTo12BitMidi([num],2)
    }


}
