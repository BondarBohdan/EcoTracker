document.getElementById('startRecording').onclick = async function() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        console.log('Мікрофон активовано');
        const audioContext = new AudioContext();
        const source = audioContext.createMediaStreamSource(stream);
        const analyser = audioContext.createAnalyser();
        source.connect(analyser);
        analyser.fftSize = 2048;

        const bufferLength = analyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);
        let isRecording = true;

        function record() {
            if (!isRecording) {
                return;  // Зупинити виклик функції, якщо запис завершено
            }
            requestAnimationFrame(record);
            analyser.getByteFrequencyData(dataArray);
            console.log(dataArray);
        }

        record();

        document.getElementById('stopRecording').disabled = false;
        document.getElementById('stopRecording').onclick = function() {
            audioContext.close().then(() => {
                console.log('Запис зупинено');
                isRecording = false;  // Встановлення прапорця стану запису в false
                this.disabled = true;
            });
        }
    } catch (error) {
        console.error('Помилка доступу до мікрофону:', error);
    }
};