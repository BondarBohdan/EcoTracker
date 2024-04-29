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
const publicKey = 'BDZwOg9BS_q2ptCYU_GZ41cBbiSmAeVWIsvlp550EtxMFdoJuW6i4Hm_YzfTM9jCxzdlMU4dE0r9NWblf5LxeZY';

function urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding)
        .replace(/\-/g, '+')
        .replace(/_/g, '/');

    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);

    for (let i = 0; i < rawData.length; ++i) {
        outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
}

// Функція для конвертації ArrayBuffer у URL-безпечну base64-кодовану стрічку
function arrayBufferToBase64(arrayBuffer) {
    var binary = '';
    var bytes = new Uint8Array(arrayBuffer);
    var len = bytes.byteLength;
    for (var i = 0; i < len; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return window.btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

if ('serviceWorker' in navigator && 'PushManager' in window) {
    navigator.serviceWorker.register('https://bondarbohdan.github.io/EcoTracker/serviceWorker.js').then(registration => {
        console.log('Service Worker зареєстровано', registration);

        return registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(publicKey)
        });
    }).then(subscription => {
        var p256dh = arrayBufferToBase64(subscription.getKey('p256dh'));
        var auth = arrayBufferToBase64(subscription.getKey('auth'));
        fetch(backURL + '/api/subscribe', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                deviceId: deviceId,
                endpoint: subscription.endpoint,
                p256dh: p256dh,
                auth: auth
            })
        }).then(() => console.log('Підписка відправлена на сервер'))
            .catch(error => console.error('Помилка відправлення підписки', error));
    }).catch(error => console.error('Помилка підписки на push повідомлення', error));
} else {
    console.warn('Push повідомлення не підтримуються цим браузером.');
}

document.getElementById('startRecording').onclick = async function() {
    try {
        if (audioChart) {
            audioChart.destroy();
        }
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: { facingMode: 'environment' } });
        console.log('Мікрофон і камера активовані');
        document.getElementById('stopRecording').disabled = false;
        this.disabled = true
        audioContext = new AudioContext();
        source = audioContext.createMediaStreamSource(stream);
        analyser = audioContext.createAnalyser();
        source.connect(analyser);
        analyser.fftSize = 2048;
        isRecording = true;

        const bufferLength = analyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength); // Масив інтенсивностей частот
        const audioCtx = document.getElementById('audioCanvas').getContext('2d');
        audioChart = new Chart(audioCtx, {
            type: 'bar',
            data: {
                labels: ['Average Frequency Amplitude'], // Тепер мітка одна
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
        }, 15000);

    } catch (error) {
        console.error('Помилка доступу до мікрофону або камери:', error);
    }
};

document.getElementById('stopRecording').onclick = function() {
    isRecording = false;  // Деактивація стану запису
    audioContext.close();

    if (video.srcObject) {
        const tracks = video.srcObject.getTracks();
        tracks.forEach(track => track.stop());
        video.srcObject = null;
    }
    document.getElementById('startRecording').disabled = false
    this.disabled = true;
    console.log('Запис зупинено');
    sendData(audioBuffer, '/api/audio');
    sendData(lightBuffer, '/api/light');
    audioBuffer = [];
    lightBuffer = [];
    clearInterval(sendDataInterval);
};

function sendData(buffer, url) {
    const payload = JSON.stringify({data: buffer});
    console.log(payload);  // Логування відправленого JSON
    fetch(backURL + url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: payload
    })
        .then(response => {
            if (!response.ok) {
                throw new Error('Network response was not ok: ' + response.statusText);
            }
            console.log('Data sent successfully:', response.status);
        })
        .catch(error => console.error('Error sending data:', error));
}

function hasSignificantChange(newVal, lastVal, threshold = 0.1) {
    if (lastVal === null) return true;
    const change = Math.abs(newVal - lastVal);
    return change >= (threshold * lastVal);
}