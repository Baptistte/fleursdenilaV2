// DOM Ready
document.addEventListener('DOMContentLoaded', function() {
    
    // ============================================
    // Navigation Scroll Effect
    // ============================================
    const nav = document.getElementById('nav');
    
    // Optimisation : Utilisation de requestAnimationFrame pour le scroll event
    let ticking = false;

    window.addEventListener('scroll', () => {
        if (!ticking) {
            window.requestAnimationFrame(() => {
                const currentScroll = window.pageYOffset;
                if (currentScroll > 50) {
                    nav.classList.add('scrolled');
                } else {
                    nav.classList.remove('scrolled');
                }
                ticking = false;
            });
            ticking = true;
        }
    }, { passive: true });

    // ============================================
    // Mobile Menu Toggle
    // ============================================
    const mobileMenuBtn = document.getElementById('mobile-menu-btn');
    const mobileMenu = document.getElementById('mobile-menu');
    const mobileLinks = document.querySelectorAll('.mobile-nav-link');
    let menuOpen = false;

    function toggleMenu() {
        menuOpen = !menuOpen;
        
        if (menuOpen) {
            mobileMenu.classList.remove('hidden');
            // Petit délai pour permettre la transition CSS
            setTimeout(() => {
                mobileMenu.classList.add('opacity-100');
                mobileMenu.classList.remove('opacity-0');
            }, 10);
            document.body.style.overflow = 'hidden';
        } else {
            mobileMenu.classList.remove('opacity-100');
            mobileMenu.classList.add('opacity-0');
            setTimeout(() => {
                mobileMenu.classList.add('hidden');
            }, 500);
            document.body.style.overflow = '';
        }
    }

    if (mobileMenuBtn) {
        mobileMenuBtn.addEventListener('click', toggleMenu);
    }

    mobileLinks.forEach(link => {
        link.addEventListener('click', () => {
            toggleMenu();
        });
    });

    // ============================================
    // Smooth Scroll
    // ============================================
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function (e) {
            e.preventDefault();
            const target = document.querySelector(this.getAttribute('href'));
            
            if (target) {
                const offset = 80; // Ajustement pour la navbar fixe
                const targetPosition = target.getBoundingClientRect().top + window.pageYOffset - offset;
                
                window.scrollTo({
                    top: targetPosition,
                    behavior: 'smooth'
                });
            }
        });
    });

    // ============================================
    // Scroll Reveal Animation (Intersection Observer)
    // ============================================
    const revealOptions = {
        threshold: 0.1,
        rootMargin: '0px 0px -50px 0px'
    };

    const revealObserver = new IntersectionObserver((entries, observer) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('active');
                observer.unobserve(entry.target); // On arrête d'observer une fois révélé
            }
        });
    }, revealOptions);

    // Initialiser les éléments à révéler
    // Ajoute automatiquement la classe .reveal aux éléments clés s'ils ne l'ont pas déjà
    // EXCLUSION des éléments FAQ pour éviter les conflits
    const elementsToAnimate = document.querySelectorAll(
        'section:not(#accueil) h2:not(.faq-container h2), section:not(#accueil) h3:not(.faq-container h3), section:not(#accueil) p:not(.faq-answer p), .collection-card, article:not(.faq-item), .gallery-item, section:not(#accueil) .bento-cell'
    );

    elementsToAnimate.forEach((el) => {
        el.classList.add('reveal');
        revealObserver.observe(el);
    });
    
    // Observer également les éléments ayant déjà la classe .reveal
    document.querySelectorAll('.reveal').forEach(el => {
        revealObserver.observe(el);
    });

    // ============================================
    // Parallax Effect (Simplifié et optimisé)
    // ============================================
    const parallaxElements = document.querySelectorAll('.parallax-bg');
    
    if (parallaxElements.length > 0) {
        window.addEventListener('scroll', () => {
            const scrolled = window.pageYOffset;
            parallaxElements.forEach(el => {
                const speed = el.dataset.speed || 0.5;
                const yPos = -(scrolled * speed);
                el.style.backgroundPosition = `center ${yPos}px`;
            });
        }, { passive: true });
    }


    // ============================================
    // Micro-interactions : Hover Effects
    // ============================================
    // Ajoute la classe hover-lift aux boutons et cartes automatiquement
    const interactives = document.querySelectorAll('.btn-primary, article, .collection-card');
    interactives.forEach(el => {
        el.classList.add('hover-lift');
    });

    // ============================================
    // FAQ Accordéon - Hauteur Constante
    // ============================================
    const faqItems = document.querySelectorAll('.faq-item');
    
    if (faqItems.length > 0) {
        faqItems.forEach(item => {
            item.addEventListener('click', () => {
                // Si on clique sur un item déjà actif, on ne fait rien
                if (item.classList.contains('active')) return;
                
                // Retirer la classe active de tous les items
                faqItems.forEach(i => i.classList.remove('active'));
                
                // Ajouter la classe active à l'item cliqué
                item.classList.add('active');
            });
        });
    }

});
