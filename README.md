![](eps16plus.jpg)
### Ensoniq EPS16+ Wavesample Utility
This a a utility to upload and download samples to and from the Ensoniq EPS16+ sampling sythesizer. I built this project becuase all the tools that currently exist seem to be getting outdated  and would not run on all operating systems (i.e M1 macs)  or were command line tools that were not intuitive, therefore would break the creative flow when trying to iterate on a song quickly. This project uses web midi to send sysex data to and from the EPS16+ so in theory should work on all operating systems (i.e. Windows, Linux, OSX, iOS, and Android).

### How to get started
[Navigate here to use the lastest version.](https://summitt.github.io/EnsoniqEPS16Plus/)

or 

You can clone the repo and open the index.html file in your browser to run the app locally. 

### How to use
To be able to upload a wav file to the EPS16+ you need to: 
1. You need to have an existing instrument, layer, and wavesample. You can use the Utility functions to do this for you. When it creates a wavesample it uses the EPS16+'s default square wave. 
2. Drag and drop a ***MONO*** WAV file into the input that says ***Drag WAV File Here***
3. This will upload the wave file into the browser and display a plot of what the audio data in the chart above. 
4. Once satisfied click Upload to EPS16+

Depending on the file size this can take some time. 
***Note***: This is very buggy for large files over 5 seconds. Something that should be fixed soonish. 

### Current Limitations and Bugs
1. Large files over 5ish seconds timeout

### Support 
- [Submit issues here](https://github.com/summitt/EnsoniqEPS16Plus/issues)
- [Support via Patron here](https://patreon.com/null0perat0r)

