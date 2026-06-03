// Estados del botón de logout
const logoutButtonStates = {
  'default': {
    '--figure-duration': '100',
    '--transform-figure': 'none',
    '--walking-duration': '100',
    '--transform-arm1': 'none',
    '--transform-wrist1': 'none',
    '--transform-arm2': 'none',
    '--transform-wrist2': 'none',
    '--transform-leg1': 'none',
    '--transform-calf1': 'none',
    '--transform-leg2': 'none',
    '--transform-calf2': 'none'
  },
  'hover': {
    '--figure-duration': '100',
    '--transform-figure': 'translateX(1.5px)',
    '--walking-duration': '100',
    '--transform-arm1': 'rotate(-5deg)',
    '--transform-wrist1': 'rotate(-15deg)',
    '--transform-arm2': 'rotate(5deg)',
    '--transform-wrist2': 'rotate(6deg)',
    '--transform-leg1': 'rotate(-10deg)',
    '--transform-calf1': 'rotate(5deg)',
    '--transform-leg2': 'rotate(20deg)',
    '--transform-calf2': 'rotate(-20deg)'
  },
  'walking1': {
    '--figure-duration': '300',
    '--transform-figure': 'translateX(11px)',
    '--walking-duration': '300',
    '--transform-arm1': 'translateX(-4px) translateY(-2px) rotate(120deg)',
    '--transform-wrist1': 'rotate(-5deg)',
    '--transform-arm2': 'translateX(4px) rotate(-110deg)',
    '--transform-wrist2': 'rotate(-5deg)',
    '--transform-leg1': 'translateX(-3px) rotate(80deg)',
    '--transform-calf1': 'rotate(-30deg)',
    '--transform-leg2': 'translateX(4px) rotate(-60deg)',
    '--transform-calf2': 'rotate(20deg)'
  },
  'walking2': {
    '--figure-duration': '400',
    '--transform-figure': 'translateX(17px)',
    '--walking-duration': '300',
    '--transform-arm1': 'rotate(60deg)',
    '--transform-wrist1': 'rotate(-15deg)',
    '--transform-arm2': 'rotate(-45deg)',
    '--transform-wrist2': 'rotate(6deg)',
    '--transform-leg1': 'rotate(-5deg)',
    '--transform-calf1': 'rotate(10deg)',
    '--transform-leg2': 'rotate(10deg)',
    '--transform-calf2': 'rotate(-20deg)'
  },
  'falling1': {
    '--figure-duration': '1600',
    '--walking-duration': '400',
    '--transform-arm1': 'rotate(-60deg)',
    '--transform-wrist1': 'none',
    '--transform-arm2': 'rotate(30deg)',
    '--transform-wrist2': 'rotate(120deg)',
    '--transform-leg1': 'rotate(-30deg)',
    '--transform-calf1': 'rotate(-20deg)',
    '--transform-leg2': 'rotate(20deg)'
  },
  'falling2': {
    '--walking-duration': '300',
    '--transform-arm1': 'rotate(-100deg)',
    '--transform-arm2': 'rotate(-60deg)',
    '--transform-wrist2': 'rotate(60deg)',
    '--transform-leg1': 'rotate(80deg)',
    '--transform-calf1': 'rotate(20deg)',
    '--transform-leg2': 'rotate(-60deg)'
  },
  'falling3': {
    '--walking-duration': '500',
    '--transform-arm1': 'rotate(-30deg)',
    '--transform-wrist1': 'rotate(40deg)',
    '--transform-arm2': 'rotate(50deg)',
    '--transform-wrist2': 'none',
    '--transform-leg1': 'rotate(-30deg)',
    '--transform-leg2': 'rotate(20deg)',
    '--transform-calf2': 'none'
  }
};

/* ══════════════════════════════════════════════
   HELPERS
═══════════════════════════════════════════════ */
let isAnimatingThemeToggle = false;

function getTargetOffset(avatarEl, targetEl) {
  const a = avatarEl.getBoundingClientRect();
  const t = targetEl.getBoundingClientRect();
  return {
    x: t.left + t.width  / 2 - a.width  / 2 - a.left,
    y: t.top  + t.height / 2 - a.height / 2 - a.top,
  };
}

function setWalkingPose(btn, dir) {
  const k = 4;
  btn.style.setProperty('--walking-duration', '1000');
  btn.style.setProperty('--transform-arm1',  `translateX(${-k*dir}px) translateY(-2px) rotate(120deg)`);
  btn.style.setProperty('--transform-wrist1', 'rotate(-5deg)');
  btn.style.setProperty('--transform-arm2',  `translateX(${k*dir}px) rotate(-110deg)`);
  btn.style.setProperty('--transform-wrist2', 'rotate(-5deg)');
  btn.style.setProperty('--transform-leg1',  `translateX(${-k*dir}px) rotate(80deg)`);
  btn.style.setProperty('--transform-calf1', 'rotate(-30deg)');
  btn.style.setProperty('--transform-leg2',  `translateX(${k*dir}px) rotate(-60deg)`);
  btn.style.setProperty('--transform-calf2', 'rotate(20deg)');
}

function clearPose(btn) {
  ['--transform-arm1','--transform-wrist1','--transform-arm2','--transform-wrist2',
   '--transform-leg1','--transform-calf1','--transform-leg2','--transform-calf2',
   '--walking-duration'].forEach(p => btn.style.removeProperty(p));
}

/* ══════════════════════════════════════════════
   TOGGLE — muñequito camina, activa, regresa
═══════════════════════════════════════════════ */
function initThemeToggle() {
  const themeToggle = document.getElementById('themeToggle');
  if (!themeToggle) return;

  themeToggle.addEventListener('click', () => {
    if (isAnimatingThemeToggle) return;
    isAnimatingThemeToggle = true;

    const avatar = document.querySelector('.figure');
    const btn    = document.querySelector('.logoutButton');
    const toggle = document.getElementById('themeToggle');
    const moon   = document.querySelector('.moon');
    const card   = document.querySelector('.header-buttons');

    if (!avatar || !btn || !moon) {
      isAnimatingThemeToggle = false;
      return;
    }

    card.style.pointerEvents = 'none';
    card.style.userSelect    = 'none';

    // Duraciones fijas: evita el bug de transitionend múltiple
    const T_ORIENT = 200;
    const T_WALK   = 900;
    const T_FLIP   = 220;

    requestAnimationFrame(() => {
      const { x: dx, y: dy } = getTargetOffset(avatar, toggle);
      const dir = Math.sign(dx) || 1;

      // FASE 1: orientar hacia el toggle
      avatar.classList.add('caminando');
      clearPose(btn);
      avatar.style.transition = `transform ${T_ORIENT}ms ease-in-out`;
      avatar.style.transform  = `scaleX(${dir})`;

      setTimeout(() => {
        // FASE 2: caminar hacia el toggle
        setWalkingPose(btn, dir);
        avatar.style.transition = `transform ${T_WALK}ms cubic-bezier(.2,.1,.8,.9)`;
        avatar.style.transform  = `translateX(${dx}px) translateY(${dy}px) scaleX(${dir})`;

        setTimeout(() => {
          // Activar tema al llegar
          document.body.classList.toggle('dark-mode');
          document.body.classList.toggle('light');
          moon.classList.toggle('sun');
          toggle.classList.toggle('day');

          // FASE 3: voltear in-situ para regresar
          clearPose(btn);
          avatar.style.transition = `transform ${T_FLIP}ms ease-in-out`;
          avatar.style.transform  = `translateX(${dx}px) translateY(${dy}px) scaleX(${-dir})`;

          setTimeout(() => {
            // FASE 4: caminar de regreso
            setWalkingPose(btn, -dir);
            avatar.style.transition = `transform ${T_WALK}ms cubic-bezier(.2,.1,.8,.9)`;
            avatar.style.transform  = 'translateX(0) translateY(0) scaleX(1)';

            setTimeout(() => {
              // FASE 5: limpiar
              avatar.classList.remove('caminando');
              avatar.style.transition = '';
              clearPose(btn);
              card.style.pointerEvents = '';
              card.style.userSelect    = '';
              isAnimatingThemeToggle   = false;
            }, T_WALK + 50);

          }, T_FLIP + 20);

        }, T_WALK + 50);

      }, T_ORIENT + 20);
    });
  });
}

// Función para inicializar el botón de logout animado
function initLogoutButton() {
  const logoutButton = document.querySelector('.logoutButton');
  
  if (!logoutButton) return;
  
  logoutButton.state = 'default';

  // Función para transicionar un botón de un estado al siguiente
  let updateButtonState = (button, state) => {
    if (logoutButtonStates[state]) {
      button.state = state;
      for (let key in logoutButtonStates[state]) {
        button.style.setProperty(key, logoutButtonStates[state][key]);
      }
    }
  };

  // Listeners de hover del mouse en el botón
  logoutButton.addEventListener('mouseenter', () => {
    if (logoutButton.state === 'default') {
      updateButtonState(logoutButton, 'hover');
    }
  });
  
  logoutButton.addEventListener('mouseleave', () => {
    if (logoutButton.state === 'hover') {
      updateButtonState(logoutButton, 'default');
    }
  });

  // Listener de click en el botón
  logoutButton.addEventListener('click', async () => {
    if (isAnimatingThemeToggle) return;
    if (logoutButton.state === 'default' || logoutButton.state === 'hover') {
      logoutButton.classList.add('clicked');
      updateButtonState(logoutButton, 'walking1');
      
             setTimeout(() => {
         logoutButton.classList.add('door-slammed');
         updateButtonState(logoutButton, 'walking2');
         
         setTimeout(() => {
           logoutButton.classList.add('falling');
           updateButtonState(logoutButton, 'falling1');
           
           setTimeout(() => {
             updateButtonState(logoutButton, 'falling2');
             
             setTimeout(() => {
               updateButtonState(logoutButton, 'falling3');
               
                              setTimeout(async () => {
                  try {
                    await fetch('http://localhost:3001/logout', {
                      method: 'POST',
                      credentials: 'include'
                    });
                  } catch {}
                  localStorage.removeItem('userInfo');
                  window.location.href = 'login.html';
                }, 800); // Aumentado a 800ms para que termine de caer completamente hasta abajo
             }, 200); // Reducido de walking-duration a 200ms
           }, 200); // Reducido de walking-duration a 200ms
         }, 250); // Aumentado de 150ms a 250ms para caminata más suave
       }, 200); // Aumentado de 100ms a 200ms para caminata más suave
    }
  });
}

// Inicializar cuando el DOM esté listo
document.addEventListener('DOMContentLoaded', () => {
  initThemeToggle();
  initLogoutButton();
}); 