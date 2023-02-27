class EPSChart {

    constructor(elementId, label, color, hasFileUpload, eps){
        this.wavesample = []
        this.eps = eps
        this.label = label
        this.chart = new Chart(
                document.getElementById(elementId + "_chart"),
                {
                type: 'line',
                data: {
                    labels:[0,1],
                    datasets: [{
                    data: [0,0],
                    label: label,
                    fill: false,
                    borderColor: color,
                    tension: 0.1,
                    pointRadius: 0,
                    borderWidth: 1
                }]
                }
            }
    );
    if(hasFileUpload){
        let self = this;
        document.getElementById(elementId).addEventListener('change', function(){
            let reader = new FileReader();
            reader.onload = function() {
                let arrayBuffer = this.result;
                self.wavesample = self.eps.parseWavFile(arrayBuffer)
                self.chart.data.labels = Array.from( {length: self.wavesample.length}, (value, index) => index),
                self.chart.data.datasets = [
                            {
                                data: self.wavesample.map( a => a/32767),
                                label: label,
                                fill: false,
                                borderColor: color,
                                tension: 0.1,
                                pointRadius: 0,
                                borderWidth: 1
                            }
                            ]
                self.chart.update()


            }
            reader.readAsArrayBuffer(this.files[0]);

        }, false);
    }
}
}