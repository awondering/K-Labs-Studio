function syncHomeScreenClass(activeScreenId){
	document.body.classList.toggle('home-screen-active',activeScreenId==='homeScreen');
}

function goScreen(id){
	document.querySelectorAll('.screen').forEach((screen)=>screen.classList.toggle('active',screen.id===id));
	document.querySelectorAll('[data-nav]').forEach((button)=>button.classList.toggle('active',button.dataset.nav===id));
	syncHomeScreenClass(id);
	if(window.KLABS_UI && typeof window.KLABS_UI.onScreenChange==='function'){
		window.KLABS_UI.onScreenChange(id);
	}
	const menuButton=document.querySelector('[data-menu-action="open-menu"]');
	if(menuButton){menuButton.setAttribute('aria-expanded','false');}
	const menuSheet=document.getElementById('navMenuSheet');
	if(menuSheet){menuSheet.hidden=true;}
	document.body.classList.remove('nav-menu-open');
	scrollTo(0,0);
}

function ensureNavMenu(){
	if(document.getElementById('navMenuSheet'))return;
	const sheet=document.createElement('div');
	sheet.id='navMenuSheet';
	sheet.className='component-sheet';
	sheet.hidden=true;
	sheet.innerHTML=`
		<div class="component-sheet__scrim" data-nav-menu-action="close"></div>
			<section class="component-sheet__panel" role="dialog" aria-modal="true" aria-label="Navigation menu">
			<header class="component-sheet__header">
				<h2>Menu</h2>
				<button class="component-sheet__close" type="button" data-nav-menu-action="close" aria-label="Close menu">×</button>
			</header>
			<div class="component-sheet__body">
					<div class="component-sheet__list nav-menu-list">
						<div class="component-sheet__row"><button class="component-sheet__option" type="button" data-nav="homeScreen">Home</button></div>
						<div class="component-sheet__row"><button class="component-sheet__option" type="button" data-nav="workshopScreen">Studio</button></div>
						<div class="component-sheet__row"><button class="component-sheet__option" type="button" data-nav="buildsScreen">Saved Jobs</button></div>
						<div class="component-sheet__row"><button class="component-sheet__option" type="button" data-nav="layoutScreen">Guide Layout &amp; Tools</button></div>
						<div class="component-sheet__row"><button class="component-sheet__option" type="button" data-nav-menu-action="find-customer">Find Customer</button></div>
						<div class="component-sheet__row"><button class="component-sheet__option" type="button" data-nav="settingsScreen">Settings</button></div>
				</div>
			</div>
		</section>
	`;
	document.body.appendChild(sheet);
	sheet.addEventListener('click',(event)=>{
		const actionButton=event.target.closest('[data-nav-menu-action]');
		if(actionButton){
			const action=actionButton.getAttribute('data-nav-menu-action')||'';
			if(action==='close'){
				closeNavMenu();
				return;
			}
			if(action==='find-customer'){
				closeNavMenu();
				if(window.KLABS_UI && typeof window.KLABS_UI.openCustomerFinder==='function'){
					window.KLABS_UI.openCustomerFinder('browse');
				}
			}
		}
	});
}

function openNavMenu(){
	ensureNavMenu();
	const sheet=document.getElementById('navMenuSheet');
	if(!sheet)return;
	sheet.hidden=false;
	document.body.classList.add('nav-menu-open');
	const button=document.querySelector('[data-menu-action="open-menu"]');
	if(button){button.setAttribute('aria-expanded','true');}
}

function closeNavMenu(){
	const sheet=document.getElementById('navMenuSheet');
	if(sheet){sheet.hidden=true;}
	const button=document.querySelector('[data-menu-action="open-menu"]');
	if(button){button.setAttribute('aria-expanded','false');}
	document.body.classList.remove('nav-menu-open');
}

document.addEventListener('click',(event)=>{
	const menuToggle=event.target.closest('[data-menu-action="open-menu"]');
	if(menuToggle){
		event.preventDefault();
		openNavMenu();
		return;
	}
	const menuNav=event.target.closest('#navMenuSheet [data-nav]');
	if(menuNav){
		if(menuNav.dataset.nav==='workshopScreen' && window.KLABS_UI && typeof window.KLABS_UI.prepareWorkshopEntry==='function'){
			window.KLABS_UI.prepareWorkshopEntry('preserve');
		}
		goScreen(menuNav.dataset.nav);
		return;
	}
	const nav=event.target.closest('[data-nav]');
	if(nav){
		if(nav.dataset.nav==='workshopScreen' && window.KLABS_UI && typeof window.KLABS_UI.prepareWorkshopEntry==='function'){
			window.KLABS_UI.prepareWorkshopEntry('preserve');
		}
		goScreen(nav.dataset.nav);
	}
});

document.addEventListener('keydown',(event)=>{
	if(event.key==='Escape'){closeNavMenu();}
});

const initialActiveScreen=document.querySelector('.screen.active');
syncHomeScreenClass(initialActiveScreen?initialActiveScreen.id:'homeScreen');
