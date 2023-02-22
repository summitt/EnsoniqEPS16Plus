import mido
from mido import Message
from mido import Backend
import time
import wave
import bitstring
import array
import struct
import numpy as np

class EPS16:

    def __init__(self):
        self.inst_num=0
        self.layer_num=0
        self.ws_bytes=[0x00, 0x01]
        self.SYSEXFOOTER = [0xf7]
        self.SYSEXHEADER = [
            0xf0,
            0x0f, ## Ensoni1 Manufactor Code
            0x03, ## EPS Product Code
            0x00, ## Midi Channel 
        ]
        mido.set_backend('mido.backends.rtmidi')
        names  = mido.backend.get_output_names()
        names = sorted(set(names))
        i=0
        for name in names:
            print("{}: {}".format(i, name))
            i=i+1

        selected = input("select midi output number?  ")
        out_port_name = names[int(selected)]
        print("You Selected {}".format(out_port_name))
        selected = input("select midi input number?  ")
        in_port_name = names[int(selected)]
        print("You Selected {}".format(in_port_name))
        self.inport = mido.open_input(in_port_name) #, callback=self.inport_callback)
        self.outport = mido.open_output(out_port_name)
        self.last_wavesample=[]
    
    def set_globals(self, inst_num, layer_num, ws_num):
        if inst_num > 7 or inst_num < 0:
            print("Invalid Instrument Number. Must be between 1 and 8")
            return
        if layer_num > 7 or layer_num < 0:
            print("Invalid Layer Number. Must be between 1 and 8")
            return
        if ws_num > 128 or ws_num < 0:
            print("Invalid WaveSample Number. Must be between 1 and 127")
            return
        self.inst_num = inst_num
        self.layer_num = layer_num
        self.ws_bytes = self.convert_to_12_bit_midi([ws_num])
        print(self.ws_bytes)
    
    def create_midi_message(self, command, data=[]):
        header = [
            command,
            0x00,
            self.inst_num,
            0x00,
            self.layer_num,
        ] + self.ws_bytes
        return header + data


    def wrap_data(self, data):
        return self.SYSEXHEADER + data + self.SYSEXFOOTER

    def send_data(self, data):
        msg = self.wrap_data(data)
        sysex = Message.from_bytes(msg)
        self.outport.send(sysex)

    def inport_callback(self, message):
        print(message.bin())

    def send_ack(self):
        data = [
            0x01,
            0x00,
            0x00
        ]
        self.send_data(data) 

    def create_instrument(self):
        data = self.create_midi_message(0x15)
        self.send_data(data)
        self.get_messages("Create Instrument Response")

    def create_layer(self):
        data = self.create_midi_message(0x16)
        self.send_data(data)
        self.get_messages("Create Layer Response")

    def create_sqr_wave(self):
        data = self.create_midi_message(0x19)
        self.send_data(data)
        self.get_messages("Create SQR Response")

    def read_wav_file(self, file_name):
        wav_file = wave.open(file_name)
        frame_number = wav_file.getnframes()
        return wav_file.readframes(frame_number)

    def convert_to_12_bit_midi(self, data, min_size=2):
        midi_array=[]
        stop = (len(data) * 8)//6
        for itr in range(0,stop):
            last_6_bits = data[-1:][0] & 0x3F
            midi_array.append(last_6_bits)
            barr = bitstring.BitArray(bytes=data)
            barr = barr >> 6
            data = barr.tobytes()
        midi_array.reverse()

        #Ensure there are always at least 2 bytes
        if len(midi_array) % 2 != 0:
            midi_array = [0] + midi_array
        #pad total size to be at least the min size
        if len(midi_array) < min_size:
            padding_size = min_size - len(midi_array) 
            for i in range(0, padding_size):
                midi_array = [0] + midi_array
        return midi_array

    def convert_to_16_bit_midi(self, audio):
        midi_array=[]
        data=[]
        for i in range(0,len(audio),2):
            word = audio[i:i+2]
            num = struct.unpack("<H", word)
            num = list(num)[0]
            data.append(num)

        for i in range(0, len(data)):
            unsigned_int = data[i]#  +2**16
            print(hex(unsigned_int))
            byte3 = unsigned_int &  0x003F # mask last 6 bits
            byte2 = (unsigned_int & 0x00C0) >> 6 # get last 2 bits
            byte2 = (unsigned_int & 0x0F00) >> 6  | byte2 # take 4 bits to merge with the 2 bits of previous step
            byte1 = (unsigned_int &  0xF000) >> 12  # get first 4 bits 
            midi_array.append(byte1)
            midi_array.append(byte2)
            midi_array.append(byte3)

        return midi_array



    def convert_from_16_bit_midi(self, data, strip_cmd=False, output_byte_array=False):
        if strip_cmd:
            #remove the first 4 bytes
            data= data[3:]

        bin_str = ''
        #need to take 3 bytes and convert to a 16bit word
        for i in range(0, len(data), 3):
                                    # only need the last 4 bits                   #only need last 6 bits                   #only need last 6 bits
            bin_str = bin_str + "{0:b}".format(data[i]).rjust(4,"0") + "{0:b}".format(data[i+1]).rjust(6,"0") + "{0:b}".format(data[i+2]).rjust(6,"0")

        #convert this to a hex string
        h=hex(int(bin_str,2)).replace("0x","")

        #fix padding 
        for i in range(0,4):
            if len(h) % 4 != 0:
                print("Needs to fix padding")
                h="0" + h

        sample_array = []
        if output_byte_array:
            for i in range(0,len(h), 4):
                sample_hex_str  = h[i]+h[i+1]+h[i+2]+h[i+3]
                sample_int = list(struct.unpack('>h',bytes.fromhex(sample_hex_str)))[0]
                sample_array.append(sample_int)
            converted = array.array('h', sample_array)

            sample_array = converted.tobytes()

        else: 
            for i in range(0,len(h), 4):
                sample_hex_str  = h[i]+h[i+1]+h[i+2]+h[i+3]
                sample_int = list(struct.unpack('>h',bytes.fromhex(sample_hex_str)))[0]
                sample_array.append(sample_int)

        return sample_array

    def get_end_offset(self, bit_16_params):
        word1 = bit_16_params[119] << 16
        word2 = bit_16_params[120] << 8
        word3 = bit_16_params[121]
        word4 = bit_16_params[122] >> 8
        offset = (word1 | word2 |  word3 | word4) >> 9
        return offset

    def get_wavesample_parameters(self):
        get_ws_params_cmd = self.create_midi_message(0x05)
        self.send_data(get_ws_params_cmd) 
        msg = self.get_messages("Get WS Params Response")
        if self.is_ack(msg) : 
            self.send_ack()
            msg = self.get_messages("Get Full params Response")
            params = self.convert_from_16_bit_midi(list(msg.data), strip_cmd=True)
            print(params)
            return params
        return None


    def clear_wavesample(self):
        params = self.get_wavesample_parameters()
        length =self.get_end_offset(params)
        byte_length = bitstring.BitArray("uint16={}".format(length)).tobytes()
        end_offsets = self.convert_to_12_bit_midi(byte_length,4)
        data = [
            0x00, ## start offset
            0x00, ## start offset
            0x00, ## start offset
            0x00, ## start offset
        ] + end_offsets
        clear_cmd = self.create_midi_message(0x1f,data)        
        self.send_data(clear_cmd) 
        self.get_messages("Clear WS Response")


    def put_wavesample_data(self, wav_data):
        midi_wav_data = self.convert_to_16_bit_midi(wav_data)
        data=np.frombuffer(wav_data, np.int16)
        length = len(data) 
        byte_length = bitstring.BitArray("uint16={}".format(length)).tobytes()
        end_offsets = self.convert_to_12_bit_midi(byte_length,4)

        sample_offsets = [
            0x00, ## start offset
            0x00, ## start offset
            0x00, ## start offset
            0x00, ## start offset
        ] + end_offsets

        print(sample_offsets)
        print(length)

        put_cmd = self.create_midi_message(0x0f,sample_offsets) 
        self.send_data(put_cmd) 
        msg = self.get_messages("Put WS Response")
        #self.send_data([0x0f] + midi_wav_data)

        if not self.is_ack(msg): 
            self.print_error_code(msg)
            return
        self.send_data(midi_wav_data)
        msg = self.get_messages("Expect ACK")
        if not self.is_ack(msg): 
            self.print_error_code(msg)
            return
        #set loop end length 
        self.set_parameter(0x20, 0x18, length) ## set loop end
    
    def create_empty_instrument_wavesample(self):
        self.create_instrument()
        self.create_layer()
        self.create_sqr_wave()
        self.set_parameter(0x20, 0x00, 2) ## set loop forward
        time.sleep(.2)
        self.set_parameter(0x20, 0x19, 0) ## set loop pos
        time.sleep(.2)
        self.set_parameter(0x20, 0x17, 0) ## set loop start
        time.sleep(.2)
        self.set_parameter(0x20, 0x18, 1) ## set loop end
        time.sleep(.2)
        self.set_parameter(0x20, 0x15, 0) ## set sample start
        time.sleep(.2)
        self.set_parameter(0x20, 0x16, 1) ## set sample end
        time.sleep(.2)
        self.truncate_wavesample()
    
    def truncate_wavesample(self):
        truncate_cmd = self.create_midi_message(0x1E)
        self.send_data(truncate_cmd)
        self.get_messages("Truncate Response")

    def print_error_code(self, msg):
        code = msg.data[5]
        match(code):
            case 0x00: print("SUCCESS: ACK {}".format(msg))
            case 0x01: print("INFO: WAIT {} ".format(msg))
            case 0x02: print("Error: Insert System Disk {}".format(msg))
            case 0x03: print("Error: Invalid Param Number {}".format(msg))
            case 0x04: print("Error: Invalid Param Value {}".format(msg))
            case 0x05: print("Error: Invalid Instrument {}".format(msg))
            case 0x06: print("Error: Invalid Layer {}".format(msg))
            case 0x07: print("Error: Layer In Use {}".format(msg))
            case 0x08: print("Error: Invalid Wavesample {}".format(msg))
            case 0x09: print("Error: Wavesample in Use {}".format(msg))
            case 0x0a: print("Error: Invalid Wavesammple data range {}".format(msg))
            case 0x0b: print("Error: File Not FOund {}".format(msg))
            case 0x0c: print("Error: Memory Full {}".format(msg))
            case 0x0d: print("Error: Instrument in Use {}".format(msg))
            case 0x0e: print("Error: No More Layers {}".format(msg))
            case 0x0f: print("Error: No More Samples {}".format(msg))
            case 0x10: print("Error: reserved {}".format(msg))
            case 0x11: print("Error: Wavesample is a copy {}".format(msg))
            case 0x12: print("Error: Zone Too Big {}".format(msg))
            case 0x13: print("Error: Sequencer Must Be Stopped {}".format(msg))
            case 0x14: print("Error: Disk Access in Progress {}".format(msg))
            case 0x15: print("Error: Disk Full {}".format(msg))
            case 0x16: print("Error: Loop is too long {}".format(msg))
            case 0x17: print("Error: NAK {}".format(msg))
            case 0x18: print("Error: No Layer To Edit {}".format(msg))
            case 0x19: print("Error: No More Pitch Tables {}".format(msg))
            case 0x1a: print("Error: Cross Fade length is zero {}".format(msg))
            case 0x1b: print("Error: Cross Fade Length is greater than 50% {}".format(msg))
            case 0x1c: print("Error: Loop Start is to close to sample start {}".format(msg))
            case 0x1d: print("Error: Loop End is to close to sample end {}".format(msg))
            case 0x1e: print("Error: Quiet Layer {}".format(msg))
            case _ : print("Unknown! {}".format(msg))

    
    def is_ack(self, msg):
        return msg.data[-1] == 0 # ack message

    def get_wavesample_data(self, offset=0):
        if offset == 0:
            params = self.get_wavesample_parameters()
            offset = self.get_end_offset(params) 

        byte_length = bitstring.BitArray("uint16={}".format(offset)).tobytes()
        end_offsets = self.convert_to_12_bit_midi(byte_length,4)
        
        sample_offsets = [
            0x00, ## start offset
            0x00, ## start offset
            0x00, ## start offset
            0x00, ## start offset
        ] + end_offsets

        get_ws_cmd = self.create_midi_message(0x06, sample_offsets)        
        self.send_data(get_ws_cmd) 
        msg = self.get_messages("Request Wave Data. Expect ACK")
        if self.is_ack(msg): # ack message
            msg = self.get_messages("Get Wave PUT Command")
            if msg.data[3] == 0xf:
                self.send_ack()
                msg = self.get_messages("Get Wave Sample Data")
                self.last_wavesample = list(msg.data[3:])
                self.send_ack()
            else:
                print("Error Getting Wave Data")

    def print_wavesample(self, convert=False):
        if convert:
            converted = self.convert_from_16_bit_midi(self.last_wavesample)
            print(converted)
        else:
            print(self.last_wavesample)

    def save_wavesample_to_wav(self, filename, samplerate):
        converted = self.convert_from_16_bit_midi(self.last_wavesample, output_byte_array=True)
        with wave.open(filename, "wb") as wav_file:
            wav_file.setnchannels(1)
            wav_file.setsampwidth(2)
            wav_file.setframerate(int(samplerate,10))
            wav_file.writeframes(converted)


    def set_parameter(self, param_group, param_code, param_value):
        byte_length = bitstring.BitArray("uint16={}".format(param_value)).tobytes()
        value_bytes = self.convert_to_12_bit_midi(byte_length,4)
        params = [
            param_group,
            param_code,
        ] + value_bytes

        set_param_cmd = self.create_midi_message(0x11, params)
        print(set_param_cmd)
        self.send_data(set_param_cmd)

    
    def set_start_and_end_offsets(self, start, end):
        self.set_parameter(0x20, 0x15, start) # set start to 0
        self.set_parameter(0x20, 0x16, end) # set end to 0


    def delete_instrument(self):
        del_inst_cmd = self.create_midi_message(0x1C)
        self.send_data(del_inst_cmd)
        msg = self.inport.receive()
        print("Delete {}".format(msg))

    def poll(self,loops=10):
        for i in range(0,loops):
            msg = self.inport.poll()
            print(msg)

    def get_messages(self, log_name):
        while True:
            for msg in self.inport.iter_pending():
                if msg.type == "sysex" and msg.data[-1] != 1:  # sysex and not wait message
                    if msg.data[3] == 1:
                        self.print_error_code(msg)
                    print("{}: {}".format(log_name, msg))
                    return msg
    def send_ccs(self):
        wait_itr=0
        while True:
            for msg in self.inport.iter_pending():
                print(msg)
                if msg.type == "control_change" and wait_itr==0:
                    wait_itr = wait_itr + 1
                    if msg.control == 1:
                        self.set_parameter(0x20,0x19,msg.value*20)
                    if msg.control == 2:
                        self.set_parameter(0x20,0x17,msg.value*20)
                    if msg.control == 3:
                        self.set_parameter(0x20,0x18,msg.value*20)
                elif wait_itr < 30:
                    wait_itr = wait_itr + 1
                    if wait_itr == 30:
                        wait_itr = 0
                




def main():
    eps = EPS16()
    while True:
        print("What would you like to do:")
        print("0. Set Global Instrument Settings (Inst Number, Layer Num, WaveSample Number)")
        print("1. Create Instrument")
        print("2. Create Layer")
        print("3. Create SQR Wavesample")
        print("4. Create Empty Wavesample")
        print("5. Delete instrument")
        print("7. Save Wavesample to file")
        print("8. Upload a wav file to ensoniq")
        resp = input("Choose a number: ")
        match resp:
            case "0": 
                inst_num = input("Set Instrument Number [1-8]?")
                inst_num = int(inst_num) -1
                layer_num = input("Set Layer Number [1-8]?")
                layer_num = int(layer_num) -1
                ws_num = input("Set WaveSample Number [1-127]?")
                ws_num = int(ws_num)
                eps.set_globals(inst_num, layer_num, ws_num)
            case "1": 
                eps.create_instrument()
            case "2": 
                eps.create_layer()
            case "3": 
                eps.create_sqr_wave()
            case "4": 
                eps.create_empty_instrument_wavesample()
            case "5":
                eps.delete_instrument()
            case "6": 
                eps.get_wavesample_data()
                filename = input("Enter a file name to save: ")
                samplerate = input("Enter a samplerate (default: 44600): ")
                if samplerate == None or samplerate == "" :
                    samplerate = "44600"
                eps.save_wavesample_to_wav(filename, samplerate)
            case "7": 
                filename = input("Enter a file name: ")
                audio = eps.read_wav_file(filename)
                eps.put_wavesample_data(audio)
            case "12":
                eps.get_wavesample_parameters()
            case _:
                print("Invalid Option...")


if __name__ == "__main__":
    main()


    
