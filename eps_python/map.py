import mido
from mido import Message
from mido import Backend


class Map:
    def __init__(self):
        mido.set_backend('mido.backends.rtmidi')
        self.inport = mido.open_input("Elektron Digitakt") #, callback=self.inport_callback)

        self.outport = mido.open_output("Launchpad Pro MK3 LPProMK3 DIN")
        self.outport2 = mido.open_output("HYDRASYNTH DR")
        self.outport3 = mido.open_output("MS-20 mini SYNTH")
        self.outport4 = mido.open_output("UltraLite-mk5")
        
    def get_messages(self):
        while True:
            for msg in self.inport.iter_pending():
                print("{}".format(msg))
                self.outport.send(msg)
                self.outport2.send(msg)
                self.outport4.send(msg)
                try:
                    if msg.channel == 9:
                        msg.channel=0
                        self.outport3.send(msg)
                except:
                    print(msg)

def main():
    map = Map()
    map.get_messages()

if __name__ == "__main__":
    main()
    