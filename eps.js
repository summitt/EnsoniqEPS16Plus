class EPS16 {
    inputs = []
    outputs = []
    constructor(setUpCallback, errorCallback, successCallback){
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
        this.successCallback = successCallback
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
        await this.sendData(cmd);
        let messages = await this.readMessages()
        for(let msg of messages){
            if(await this.isAck(msg)){
                await this.sendAck()
                let responses = await this.readMessages()
                for(let resp of responses){
                    return this.convertFrom16BitMidi(resp, true)
                }
            }
        }
        this.errorCallback("Error: Unable to get WaveSample Parameters")
        return []
        
    }
    async deleteInstrument(){
        const msg = this.createMIDIMessage(0x1C)
        await this.sendData(msg)
        let messages = await this.readMessages()
        if(await this.isAck(messages[0])){
            this.successCallback("Success: Deleted instrument")
        }else{
            this.errorCallback("Error: Unable to delete instrument")
        }
    }
    async sendAck(){
        const data = [
            0x01,
            0x00,
            0x00
        ]
        await this.sendData(data) 
    }
    async createInstrument(){
        let message = this.createMIDIMessage(0x15)
        await this.sendData(message)
        let messages = await this.readMessages()
        if(await this.isAck(messages[0])){
            this.successCallback("Success: Created instrument")
            return true
        }else{
            this.errorCallback("Error: Unable to create instrument")
            return false
        }

    }
    async createLayer(){
        let message = this.createMIDIMessage(0x16)
        await this.sendData(message)
        let messages = await this.readMessages()
        if(await this.isAck(messages[0])){
            this.successCallback("Success: Created layer")
            return true
        }else{
            this.errorCallback("Error: Unable to create layer")
            return false
        }
    }
    async createSqrWave(){
        let message = this.createMIDIMessage(0x19)
        await this.sendData(message)
        let messages = await this.readMessages()
        if(await this.isAck(messages[0])){
            this.successCallback("Success: Created SQR")
            return true
        }else{
            this.errorCallback("Error: Unable to create SQR wavesample")
            return false;
        }
    }
    async clearWavesample(){
        let params = await this.getWavesampleParams()
        if(params.length == 0) return false
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
        await this.sendData(cmd)
        let messages = await this.readMessages()
        if(await this.isAck(messages[0])){
            this.successCallback("Success: Cleared wavesample")
            return true
        }else{
            this.errorCallback("Error: Ubnable to clear wavesample")
            return false
        }

    }
    async truncateWavesample(){
        let cmd = this.createMIDIMessage(0x1E)
        await this.sendData(cmd)
        let messages = await this.readMessages()
        if(await this.isAck(messages[0])){
            this.successCallback("Success: Truncated wavesample")
            return true
        }else{
            this.errorCallback("Error: Unable to Truncate wavesample")
            return false
        }
    }
    async getWavesampleDataChunked(chunkSize, plotCallback){
        let wavedata = []
        const params = await this.getWavesampleParams()
        if(params.length == 0 ) return []
        const offset = this.getEndOffset(params)
        const iter = Math.floor(offset/chunkSize)
        for(let i=0; i<=iter; i++){
            let start = chunkSize * i
            let end = (chunkSize *i) + chunkSize
            let wavePart = await this.getWavesampleData(start, end)
            wavedata = wavedata.concat(wavePart)
            console.log("WAVE", wavedata.length)

            plotCallback(wavedata, Math.round((wavedata.length / offset) * 100)/100)
        }
        if(wavedata.length < offset){
            let start = wavedata.length
            let end = offset
            let wavePart = await this.getWavesampleData(start,end)

            wavedata = wavedata.concat(wavePart)
            console.log("WAVE Last", wavedata.length)

            plotCallback(wavedata, Math.round((wavedata.length / offset) * 100)/100)
        }
        
        return wavedata
    }
    async getWavesampleData(start, end){
        let startOffset = this.convertTo12BitMidi([start],4)
        let endOffset = this.convertTo12BitMidi([end],4)
        let sampleOffsets = startOffset.concat(endOffset)
        let cmd = this.createMIDIMessage(0x06, sampleOffsets)
        await this.sendData(cmd)
        await this.sleep(1000)
        let responses = await this.readMessages()
        for(let resp of responses){
            if(await this.isAck(resp)){
                await this.sendAck()
                let messages = await this.readMessages()
                for(let msg of messages){
                    if(msg.length > 4){
                        let waveData = this.convertFrom16BitMidi(msg)
                        for(let i=0; i<waveData.length; i++){
                            waveData[i] = this.convertToSignedInt(waveData[i]) 

                        }
                        this.successCallback("Success: Getting wavesample data from EPS")
                        return waveData
                    }
                }

            }
        }
        this.errorCallback("Error: Unable to get wavesample data from EPS")
        return []
    }
    async setParameter(paramGroup, paramByte, paramValue){
        let header = [paramGroup, paramByte]
        let midiValue = this.convertTo12BitMidi([paramValue],4)
        let msg = header.concat(midiValue)
        let cmd = this.createMIDIMessage(0x11,msg)
        console.log("Set Parameter", cmd)
        await this.sendData(cmd)
        return this.sleep(500)
    }
    async putWavesampleDataInChunks(audio, chunkSize){
        let chunks = []
        for (let i = 0; i < audio.length; i += chunkSize) {
            const chunk = audio.slice(i, i + chunkSize);
            chunks.push(chunk)
        }

        let start = 0;
        for(let chunk of chunks){
            if(!await this.putWavesampleData(chunk, start)) return false
            start+=chunkSize
        }
        await this.sleep(1000)
        await this.setParameter(0x20, 0x18, audio.length)
        return true

    }
    async putWavesampleData(audio, start=0){
        let midiData = this.convertTo16BitMidi(audio)
        let startOffset = this.convertTo12BitMidi([start], 4)
        let endOffset = this.convertTo12BitMidi([audio.length + start], 4)
        let sampleOffsets = startOffset.concat(endOffset)
        let cmd = this.createMIDIMessage(0x0f,sampleOffsets)
        await this.sendData(cmd)
        await this.sleep(500)
        let messages = await this.readMessages()
        for(let msg of messages){
            if(await this.isAck(msg)){
                await this.sendData(midiData)
                await this.sleep(500)
                let responses = await this.readMessages()
                for(let resp of responses){
                    if(await this.isAck(resp)){
                        this.sendAck()
                        this.successCallback("Success: Wavesample data successfully sent")
                        return true
                    }
                }
            }
        }
        this.errorCallback("Error: Unable to send wavesample data to EPS")
        return false


    }

    async uploadWavToEPS(audio){
        await this.setParameter(0x20, 0x00, 2) // set loop forward
        await this.setParameter(0x20, 0x19, 0) // set loop pos
        await this.setParameter(0x20, 0x17, 0) // set loop start
        await this.setParameter(0x20, 0x18, 1) // set loop end
        await this.setParameter(0x20, 0x15, 0) // set sample start
        await this.setParameter(0x20, 0x16, 1) // set sample end
        return await this.truncateWavesample() && await this.putWavesampleDataInChunks(audio,256)
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
    async isAck(message){
        if(typeof message != 'undefined' && message.length >0 && message[0] == 1 && message[message.length-1] == 1){ /// Wait message
            let messages = await this.readMessages()
            for(let msg of messages){
                if(msg[0]=1)
                return await this.isAck(msg)
            }
        }else if(typeof message != 'undefined' && message.length >0 && message[0] == 1 && message[message.length-1] == 0){ /// ACK message
            return true
        }else{
            return false
        }
    }
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
    async readMessages(){ 
        let readMessages = []
        const startTime = Date.now()
        let timeout=0;
        while(this.midiMessages.length == 0 &&  timeout < 5000){
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
            console.log("Received <-", midiMessage.data)
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
    async sendData(message){
        let packet = [
            0xF0,
            0x0F,
            0x03,
            0x00
        ]
        packet = packet.concat(message)
        packet.push(0xf7)
        console.log("Send ->", packet)
        await this.midiOutput.send(packet)

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
        let stop = binString.length/6
        let midiArray = []
        for(let i=0; i<stop; i++){
            let last6Bits = binString.substring(binString.length - 6, binString.length)
            if(binString.length < 6 && parseInt(last6Bits,2) == 0){
                continue
            }else{
                binString = binString.substring(0, binString.length -6)
                midiArray.push(parseInt(last6Bits,2))
            }
        }
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
        console.log("OFFSET", offset)
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
    getCrossFadeBreakPoints(length, step){
        const sectionLength = Math.floor( 128 / ((length -1)*2) )
        const halfSectionLength = Math.floor(sectionLength/2)
        
        let breakPoints = { pointA:0, pointB:0, pointC:127, pointD:127}
        if(step == 0){
            breakPoints.pointC = halfSectionLength
            breakPoints.pointD = halfSectionLength + sectionLength
        }else if(step == (length-1)){
            let prev = this.getCrossFadeBreakPoints(length, step -1)
            breakPoints.pointA = prev.pointC
            breakPoints.pointB = prev.pointD 
        }
        else{
            let prev = this.getCrossFadeBreakPoints(length, step -1)
            breakPoints.pointA = prev.pointC
            breakPoints.pointB = prev.pointD 
            breakPoints.pointC = breakPoints.pointB + sectionLength 
            breakPoints.pointD = breakPoints.pointC + sectionLength
        }
        return breakPoints
    }

    /***
     * Macros
     */
    async uploadAsTranswave(arrayOfWaveTables){
        this.setLayerNumber(0)
        this.setWavesampleNumber(1)
        for(let i=this.instNum; i<8; i++){
            if(await this.createInstrument()){
                await this.createLayer()
                await this.createSqrWave()
                break;
            }else{
                this.setInstrumentNumber(i)
            }
        }
        let transwave = []
        for(let wave of arrayOfWaveTables){
            transwave = transwave.concat(wave)
        }
        await this.uploadWavToEPS(transwave)
        //set loop end
        await this.sleep(1000)
        await this.setParameter(0x20,0x18,arrayOfWaveTables[0].length)
        //set modulation to transwave
        await this.setParameter(0x20,0x06,0x07)
        //set modulation source to wheel
        await this.setParameter(0x20,0x07,0x0A)
        //set modulation ammount
        await this.setParameter(0x20,0x08,arrayOfWaveTables.length+1)
        this.successCallback("Complete: Uploaded Transwave")

    }
    async uploadToDifferentInstruments(arrayOfWaveTables){
        this.setLayerNumber(0)
        this.setWavesampleNumber(1)
        for(let wave of arrayOfWaveTables){
            for(let i=this.instNum; i<8; i++){
                if(await this.createInstrument()){
                    await this.createLayer()
                    await this.createSqrWave()
                    await this.uploadWavToEPS(wave)
                    await this.sleep(500)
                    break;
                }else{
                    this.setInstrumentNumber(i)
                }

            }
        }
        this.successCallback("Complete: Uploading samples")
    }
    async createMorphingWaveTable(arrayOfWaveTables){
        //enable all patche
        for(let i=this.instNum; i<8; i++){
            if(await this.createInstrument()){
                break;
            }else{
                this.setInstrumentNumber(i)
            }

        }
        this.setLayerNumber(0)
        this.setWavesampleNumber(1)
        await this.setParameter(0x28, 0x00, 0xFF) // enable all patches
        for(let i=0; i< arrayOfWaveTables.length; i++){
            if(i==8) break
            const bp = this.getCrossFadeBreakPoints(arrayOfWaveTables.length,i)
            let wave = arrayOfWaveTables[i]
            this.setLayerNumber(i)
            this.setWavesampleNumber(1)
            await this.createLayer()
            await this.createSqrWave()
            this.setWavesampleNumber(i+1)
            await this.uploadWavToEPS(wave)
            await this.sleep(500)
            await this.setParameter(0x18,0x05, 1) // crossfade to linier
            await this.setParameter(0x18,0x03, bp.pointA)
            await this.setParameter(0x18,0x0B, bp.pointB)
            await this.setParameter(0x18,0x04, bp.pointC)
            await this.setParameter(0x18,0x0C, bp.pointD)
            await this.setParameter(0x18,0x07, 0) // modulation source to LFO
            await this.setParameter(0x18,0x0A, 127) // modulation amount
            await this.setParameter(0x1C,0x02, 15) // LFO speed
            await this.setParameter(0x1C,0x03, 127) // LFO depth
            await this.setParameter(0x1C,0x04, 0) // LFO Delay
            await this.setParameter(0x1C,0x05, 1) // LFO Reset
            await this.setParameter(0x1C,0x08, 0x0F) // LFO Modulation source
            await this.setParameter(0x1C,0x07, 0x0F) // LFO Modulation source

            this.setWavesampleNumber(1)
            await this.sleep(1000)

        }
        this.successCallback("Complete: Uploading samples")
    }


}
