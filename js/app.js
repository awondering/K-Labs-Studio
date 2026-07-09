function setOfflineStatusLabel(label){
	const el=document.getElementById('offlineReadyStatus');
	if(!el)return;
	el.textContent=label;
	const settingsEl=document.getElementById('settingsOfflineStatus');
	if(settingsEl){
		settingsEl.textContent=label;
	}
}

if('serviceWorker' in navigator){
	window.addEventListener('load',()=>{
		navigator.serviceWorker.register('./service-worker.js').then(()=>{
			return navigator.serviceWorker.ready;
		}).then(()=>{
			setOfflineStatusLabel('OFFLINE READY');
		}).catch(()=>{
			setOfflineStatusLabel('READY OFFLINE');
		});
	});

	navigator.serviceWorker.addEventListener('controllerchange',()=>{
		setOfflineStatusLabel('OFFLINE READY');
	});
}

KLABS_UI.buildWheels();
KLABS_UI.renderBlanks();
KLABS_UI.render();
