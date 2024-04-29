self.addEventListener('push', function(event) {
    const data = event.data.json();
    const promiseChain = self.registration.showNotification(data.title, {
        body: data.body,
        icon: '/icon.png'
    });
    event.waitUntil(promiseChain);
});