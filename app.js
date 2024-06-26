let audioContext;
let source;
let analyser;
let video;
let audioChart;
let lightChart;
let isRecording = false;
let audioBuffer = [];
let lightBuffer = [];
let lastAudioValue = null;
let lastLightValue = null;
let sendDataInterval;

function getDeviceId() {
    let deviceId = localStorage.getItem('deviceId');
    if (!deviceId) {
        deviceId = 'device-' + Math.random().toString(36).substr(2, 9);
        localStorage.setItem('deviceId', deviceId);
    }
    return deviceId;
}

const backURL = 'https://ecotracker-back.onrender.com';
const deviceId = getDeviceId();

document.getElementById('startRecording').onclick = async function() {
    try {
        if (audioChart) {
            audioChart.destroy();
        }
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: { facingMode: 'environment' } });
        document.getElementById('stopRecording').disabled = false;
        this.disabled = true
        audioContext = new AudioContext();
        source = audioContext.createMediaStreamSource(stream);
        analyser = audioContext.createAnalyser();
        source.connect(analyser);
        analyser.fftSize = 2048;
        isRecording = true;
        startLongPolling()

        const bufferLength = analyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);
        const audioCtx = document.getElementById('audioCanvas').getContext('2d');
        audioChart = new Chart(audioCtx, {
            type: 'bar',
            data: {
                labels: ['Average Frequency Amplitude'],
                datasets: [{
                    label: 'Average Audio Level',
                    data: [0],
                    borderColor: 'rgb(75, 192, 192)'
                }]
            },
            options: {
                scales: { y: { beginAtZero: true } },
                animation: { duration: 0 }
            }
        });

        function recordAudio() {
            if (!isRecording) {
                return;
            }
            requestAnimationFrame(recordAudio);
            analyser.getByteFrequencyData(dataArray);

            let newAverageAmplitude = dataArray.reduce((acc, val) => acc + val, 0) / dataArray.length;

            if (hasSignificantChange(newAverageAmplitude, lastAudioValue, 0.1)) {
                const audioDataWithDeviceId = {
                    deviceId: deviceId,
                    averageAudioAmplitude: newAverageAmplitude,
                    timestamp: new Date().toISOString()
                };
                audioBuffer.push(audioDataWithDeviceId);
                lastAudioValue = newAverageAmplitude;

                audioChart.data.datasets[0].data = [newAverageAmplitude];
                audioChart.update();
            }
        }

        recordAudio();

        if (lightChart) {
            lightChart.destroy();
        }
        video = document.createElement('video');
        video.srcObject = stream;
        video.play();

        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');

        const lightCtx = document.getElementById('lightCanvas').getContext('2d');
        lightChart = new Chart(lightCtx, {
            type: 'bar',
            data: {
                labels: ['Light Level'],
                datasets: [{ label: 'Light Intensity', data: [0], backgroundColor: 'rgba(255, 205, 86, 0.5)' }]
            },
            options: {
                scales: { y: { beginAtZero: true } },
                animation: { duration: 0 }
            }
        });

        function measureLight() {
            if (video.readyState === video.HAVE_ENOUGH_DATA && isRecording) {
                canvas.width = video.videoWidth;
                canvas.height = video.videoHeight;
                ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
                const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
                let totalLight = 0;
                let count = 0;
                for (let i = 0; i < imageData.data.length; i += 4) {
                    totalLight += (imageData.data[i] + imageData.data[i + 1] + imageData.data[i + 2]) / 3;
                    count++;
                }
                const newAverageLightValue  = totalLight / count;
                if (hasSignificantChange(newAverageLightValue, lastLightValue, 0.1)) {
                    const lightDataWithDeviceId = {
                        deviceId: deviceId,
                        lightLevel: newAverageLightValue,
                        timestamp: new Date().toISOString()
                    };
                    lightBuffer.push(lightDataWithDeviceId);
                    lastLightValue = newAverageLightValue;

                    lightChart.data.datasets[0].data = [newAverageLightValue];
                    lightChart.update();
                }
            }
            requestAnimationFrame(measureLight);
        }

        measureLight();


        sendDataInterval = setInterval(() => {
            if (audioBuffer.length) {
                sendData(audioBuffer, '/api/audio');
                audioBuffer = [];
                lastAudioValue = null;
            }
            if (lightBuffer.length) {
                sendData(lightBuffer, '/api/light');
                lightBuffer = [];
                lastLightValue = null;
            }
        }, 10000);

    } catch (error) {
        console.error('Error accessing microphone or camera:', error);
    }
};

document.getElementById('stopRecording').onclick = function() {
    isRecording = false;
    audioContext.close();

    if (video.srcObject) {
        const tracks = video.srcObject.getTracks();
        tracks.forEach(track => track.stop());
        video.srcObject = null;
    }
    document.getElementById('startRecording').disabled = false
    this.disabled = true;
    sendData(audioBuffer, '/api/audio');
    sendData(lightBuffer, '/api/light');
    audioBuffer = [];
    lightBuffer = [];
    clearInterval(sendDataInterval);
};

function sendData(buffer, url) {
    const payload = JSON.stringify({data: buffer});
    fetch(backURL + url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: payload
    })
        .then(response => {
            if (!response.ok) {
                throw new Error('Network response was not ok: ' + response.statusText);
            }
        })
        .catch(error => console.error('Error sending data:', error));
}

function hasSignificantChange(newVal, lastVal, threshold = 0.05) {
    if (lastVal === null) return true;
    const change = Math.abs(newVal - lastVal);
    return change >= (threshold * lastVal);
}

function playBeep(duration, frequency, volume) {
    var oscillator = audioContext.createOscillator();
    var gainNode = audioContext.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);

    oscillator.frequency.value = frequency;
    gainNode.gain.value = volume;

    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + duration * 0.001);
}

function startLongPolling() {
    if (!isRecording) return;
    var audioContext = new (window.AudioContext || window.webkitAudioContext)();

    fetch(backURL + '/api/poll/' + deviceId, {
        method: 'GET'
    })
        .then(response => {
            if (response.status === 204) {
                return null;
            }
            return response.json();
        })
        .then(data => {
            if (data && data.message) {
                playBeep(1000, 440, 1.0);
                alert('Received alert: ' + data.message);
            }
        })
        .catch(error => console.error('Error fetching alert:', error));
}
setInterval(startLongPolling, 5000);