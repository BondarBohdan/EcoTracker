let audioContext;
let source;
let analyser;
let video;
let audioChart;
let lightChart;
let isRecording = false;

document.getElementById('startRecording').onclick = async function() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: { facingMode: 'environment' } });
        console.log('Мікрофон і камера активовані');
        document.getElementById('stopRecording').disabled = false;
        audioContext = new AudioContext();
        source = audioContext.createMediaStreamSource(stream);
        analyser = audioContext.createAnalyser();
        source.connect(analyser);
        analyser.fftSize = 2048;

        const bufferLength = analyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);
        let audioData = [];
        let isRecording = true;

        const audioCtx = document.getElementById('audioCanvas').getContext('2d');
        audioChart = new Chart(audioCtx, {
            type: 'line',
            data: {
                labels: Array.from({length: bufferLength}, (_, i) => i),
                datasets: [{ label: 'Audio Level', data: [], borderColor: 'rgb(75, 192, 192)', borderWidth: 1 }]
            },
            options: {
                scales: { y: { beginAtZero: true } },
                animation: { duration: 0 }
            }
        });

        function record() {
            if (!isRecording) {
                return;
            }
            requestAnimationFrame(record);
            analyser.getByteFrequencyData(dataArray);
            audioData.push([...dataArray]);
            audioChart.data.datasets[0].data = dataArray;
            audioChart.update();

            if (audioData.length >= 100) {
                fetch('https://your-external-server.com/api/audio-data', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ data: audioData })
                })
                    .then(response => response.json())
                    .then(data => console.log('Audio data sent successfully'))
                    .catch((error) => console.error('Error:', error));

                audioData = [];
            }
        }

        record();

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
            if (video.readyState === video.HAVE_ENOUGH_DATA) {
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
                const averageLight = totalLight / count;
                lightChart.data.datasets[0].data = [averageLight];
                lightChart.update();

                // Sending light data to the server
                fetch('https://your-external-server.com/api/light-data', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ lightLevel: averageLight })
                })
                    .then(response => response.json())
                    .then(data => console.log('Light data sent successfully'))
                    .catch((error) => console.error('Error sending light data:', error));
            }
            requestAnimationFrame(measureLight);
        }

        measureLight();
    } catch (error) {
        console.error('Error accessing microphone or camera:', error);
    }
};

document.getElementById('stopRecording').onclick = function() {
    audioContext.close().then(() => {
        console.log('Аудіозапис зупинено');
    });

    if (video.srcObject) {
        const tracks = video.srcObject.getTracks();
        tracks.forEach(track => track.stop());
        video.srcObject = null;
    }

    // Деактивувати кнопку "Зупинити запис" після зупинки потоків
    this.disabled = true;
    console.log('Запис зупинено');
};