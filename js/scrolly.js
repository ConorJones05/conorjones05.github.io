(function initScrolly(){
  const scrollySections = Array.from(document.querySelectorAll('.scrolly-section'));
  const narrativeSections = Array.from(document.querySelectorAll('.narrative-section'));
  const allSections = Array.from(document.querySelectorAll('[data-section]'));
  const progressBar = document.getElementById('scrollProgress');
  const sectionNav = document.getElementById('sectionNav');

  function createNav(){
    if(!sectionNav) return;
    allSections.forEach(section=>{
      const id = section.dataset.section;
      const btn = document.createElement('button');
      btn.className='section-dot';
      btn.dataset.target=id;
      btn.addEventListener('click',()=>{
        window.scrollTo({top: window.pageYOffset + section.getBoundingClientRect().top - window.innerHeight*0.18, behavior:'smooth'});
      });
      sectionNav.appendChild(btn);
    });
  }

  function updateProgress(){
    if(!progressBar) return;
    const scrollHeight = document.documentElement.scrollHeight - window.innerHeight;
    const p = scrollHeight>0 ? (window.pageYOffset/scrollHeight)*100 : 0;
    progressBar.style.width = Math.min(100,p)+'%';
  }

  function refresh(){
      narrativeSections.forEach(sec=>{
      const r = sec.getBoundingClientRect();
      if(r.top < window.innerHeight*0.65 && r.bottom > window.innerHeight*0.15) sec.classList.add('visible');
    });

    scrollySections.forEach(sec=>{
      const r = sec.getBoundingClientRect();
      if(r.top < window.innerHeight*0.6 && r.bottom > window.innerHeight*0.3){
        sec.classList.add('active');
      } else {
        sec.classList.remove('active');
      }
    });

    if(sectionNav){
      const dots = sectionNav.querySelectorAll('.section-dot');
      allSections.forEach((s,i)=>{
        const r = s.getBoundingClientRect();
        if(r.top < window.innerHeight*0.6 && r.bottom > window.innerHeight*0.3){
          dots[i].classList.add('active');
        } else dots[i].classList.remove('active');
      });
    }

    updateProgress();
  }

  if(allSections.length){
    createNav();
    setTimeout(()=>{ if(narrativeSections[0]) narrativeSections[0].classList.add('visible'); },120);
    window.addEventListener('scroll', ()=> requestAnimationFrame(refresh), {passive:true});
    window.addEventListener('resize', ()=> requestAnimationFrame(refresh));
    refresh();
  }
})();
