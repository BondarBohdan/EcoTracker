document.getElementById('startRecording').onclick = async function() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        console.log('Мікрофон активовано');
        const audioContext = new AudioContext();
        const source = audioContext.createMediaStreamSource(stream);
        const analyser = audioContext.createAnalyser();
        source.connect(analyser);
        analyser.fftSize = 2048;

        const bufferLength = analyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);
        let audioData = [];
        let isRecording = true;

        // Додавання елементів для візуалізації
        const audioDisplay = document.getElementById('audioDisplay');
        const lightDisplay = document.getElementById('lightDisplay');

        function record() {
            if (!isRecording) {
                return;
            }
            requestAnimationFrame(record);
            analyser.getByteFrequencyData(dataArray);
            audioData.push([...dataArray]);

            // Відображення аудіоданих
            audioDisplay.textContent = `Audio data: ${dataArray.slice(0, 10).join(', ')}`;

            if (audioData.length >= 100) {
                fetch('/api/audio-data', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ data: audioData })
                })
                    .then(response => response.json())
                    .then(data => console.log('Audio data sent successfully'))
                    .catch((error) => console.error('Error:', error));

                audioData = [];
            }
        }

        record();

        // Обробка датчика освітленості
        if ('AmbientLightSensor' in window) {
            const sensor = new AmbientLightSensor();
            sensor.onreading = () => {
                console.log('Current light level:', sensor.illuminance);
                lightDisplay.textContent = `Light level: ${sensor.illuminance} lux`;
                // Можна також відправляти дані на сервер як і з аудіоданими
            };
            sensor.onerror = (event) => {
                console.log(event.error.name, event.error.message);
            };
            sensor.start();
        }

        document.getElementById('stopRecording').disabled = false;
        document.getElementById('stopRecording').onclick = function() {
            audioContext.close().then(() => {
                console.log('Запис зупинено');
                isRecording = false;
                this.disabled = true;
            });
        }
    } catch (error) {
        console.error('Помилка доступу до мікрофону:', error);
    }
};