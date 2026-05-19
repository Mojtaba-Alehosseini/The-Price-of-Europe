export class Navigation {
    static init() {
        const nav = document.getElementById('main-nav');
        const toggle = document.getElementById('nav-toggle');
        const navLinks = document.getElementById('nav-links');
        if (!nav) return;

        // Mobile hamburger toggle
        if (toggle && navLinks) {
            toggle.addEventListener('click', () => {
                const isOpen = navLinks.classList.toggle('is-open');
                toggle.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
            });
            // Close menu when a link is clicked
            navLinks.querySelectorAll('a').forEach(link => {
                link.addEventListener('click', () => {
                    navLinks.classList.remove('is-open');
                    toggle.setAttribute('aria-expanded', 'false');
                });
            });
        }

        // Combined scroll handler (nav background + mobile menu close + progress bar)
        const progressBar = document.querySelector('.scroll-progress');
        let scrollTicking = false;
        window.addEventListener('scroll', () => {
            if (scrollTicking) return;
            scrollTicking = true;
            requestAnimationFrame(() => {
                const scrollTop = window.scrollY;
                if (scrollTop > 50) nav.classList.add('scrolled');
                else nav.classList.remove('scrolled');

                if (navLinks && navLinks.classList.contains('is-open')) {
                    navLinks.classList.remove('is-open');
                    if (toggle) toggle.setAttribute('aria-expanded', 'false');
                }

                if (progressBar) {
                    const docHeight = document.body.scrollHeight - window.innerHeight;
                    const progress = docHeight > 0 ? (scrollTop / docHeight) * 100 : 0;
                    progressBar.style.width = `${progress}%`;
                }
                scrollTicking = false;
            });
        }, { passive: true });

        // Hero stats counter animation
        Navigation.animateHeroStats();

        // IntersectionObserver for nav active states
        Navigation.setupNavActiveState();
    }

    static animateHeroStats() {
        const stats = document.querySelectorAll('.hero-stat-number');
        stats.forEach(stat => {
            const target = parseFloat(stat.dataset.target);
            const prefix = stat.dataset.prefix || '';
            const suffix = stat.dataset.suffix || '';
            const duration = 1500;
            const startTime = performance.now();

            function update(currentTime) {
                const elapsed = currentTime - startTime;
                const progress = Math.min(elapsed / duration, 1);
                const eased = 1 - Math.pow(1 - progress, 3);
                const current = target * eased;

                if (Number.isInteger(target)) {
                    stat.textContent = prefix + Math.round(current) + suffix;
                } else {
                    stat.textContent = prefix + current.toFixed(1) + suffix;
                }

                if (progress < 1) {
                    requestAnimationFrame(update);
                }
            }

            requestAnimationFrame(update);
        });
    }

    static setupNavActiveState() {
        const sections = document.querySelectorAll('[data-act]');
        const navLinks = document.querySelectorAll('.nav-links a[data-nav-act]');

        if (!sections.length || !navLinks.length) return;

        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    const act = entry.target.dataset.act;
                    navLinks.forEach(link => {
                        link.classList.toggle('is-active', link.dataset.navAct === act);
                    });
                }
            });
        }, {
            rootMargin: '-40% 0px -55% 0px',
            threshold: 0
        });

        sections.forEach(section => observer.observe(section));
    }
}
