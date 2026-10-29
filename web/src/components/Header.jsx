import React, { useState, useEffect, useRef } from 'react';
import { NavLink, Link, useLocation, useNavigate } from 'react-router-dom';
import { Logo } from './Logo';
import { useAuth, getDisplayName, getShortDisplayName, UserAvatar } from '../auth';
import { UsagePill } from './UsagePill';
import { useBillingStatus } from '../lib/billing';
import {
  Menu,
  X,
  ChevronDown,
  ShieldAlert,
  PhoneCall,
  Shield,
  FileText,
  LogOut,
  LayoutDashboard,
  Settings,
  Sparkles,
  HelpCircle,
  MessageSquare,
  ExternalLink
} from 'lucide-react';

function BrowserIcon({ size = 14, className = '' }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <rect x="2" y="3" width="20" height="18" rx="4" />
      <path d="M 2 9 L 22 9" />
      <circle cx="6" cy="6" r="1" fill="currentColor" />
      <circle cx="10" cy="6" r="1" fill="currentColor" />
    </svg>
  );
}

const RESOURCE_ITEMS = [
  {
    id: 'scam-guides',
    title: 'Scam guides',
    desc: 'Job, UPI & message tactics',
    icon: ShieldAlert
  },
  {
    id: 'safety-checklist',
    title: 'Safety checklist',
    desc: 'Helpline 1930 & prevention steps',
    icon: PhoneCall
  },
  {
    id: 'faq',
    title: 'FAQ',
    desc: 'Screening, data & proof questions',
    icon: MessageSquare
  },
  {
    id: 'privacy-data',
    title: 'Privacy & data',
    desc: 'In-memory processing & retention',
    icon: Shield
  },
  {
    id: 'limitations',
    title: 'Limitations',
    desc: 'What checks can & cannot do',
    icon: FileText
  },
  {
    id: 'contact-report',
    title: 'Contact / Report',
    desc: 'Official reporting & contacts',
    icon: ExternalLink
  }
];

export function Header() {
  const [isScrolled, setIsScrolled] = useState(false);
  const [openDropdown, setOpenDropdown] = useState(null); // 'resources' | 'account' | null
  const resourcesOpen = openDropdown === 'resources';
  const accountMenuOpen = openDropdown === 'account';
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);
  const [mobileResourcesOpen, setMobileResourcesOpen] = useState(false);

  const { session, profile, signOut } = useAuth();
  const { isPro, daysLeft } = useBillingStatus(session);

  const location = useLocation();
  const navigate = useNavigate();

  const dropdownRef = useRef(null);
  const dropdownBtnRef = useRef(null);
  const accountMenuRef = useRef(null);
  const accountBtnRef = useRef(null);
  const drawerRef = useRef(null);
  const menuItemsRef = useRef([]);
  const accountItemsRef = useRef([]);

  const displayName = getDisplayName(profile, session);
  const shortDisplayName = getShortDisplayName(displayName, 14);
  const fullEmail = (profile?.email || session?.user?.email || '').trim();

  // Coordinated menu controls: only one dropdown can ever be active at a time
  const closeAllMenus = () => {
    setOpenDropdown(null);
  };

  const toggleResourcesMenu = (e) => {
    if (e && typeof e.stopPropagation === 'function') e.stopPropagation();
    setOpenDropdown((prev) => (prev === 'resources' ? null : 'resources'));
  };

  const toggleAccountMenu = (e) => {
    if (e && typeof e.stopPropagation === 'function') e.stopPropagation();
    setOpenDropdown((prev) => (prev === 'account' ? null : 'account'));
  };

  const handleResourceItemClick = (id) => {
    closeAllMenus();
    if (location.pathname === '/resources') {
      const el = document.getElementById(id);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }
  };

  // Close menus on route change or search/hash change
  useEffect(() => {
    closeAllMenus();
    setMobileDrawerOpen(false);
  }, [location.pathname, location.search, location.hash]);

  // Scroll detection: bar shrinks and strengthens border after 40px scroll
  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 40);
    };
    handleScroll();
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Uniform outside-click listener: closes open menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      const inResources = dropdownRef.current && dropdownRef.current.contains(e.target);
      const inAccount = accountMenuRef.current && accountMenuRef.current.contains(e.target);
      if (!inResources && !inAccount) {
        setOpenDropdown(null);
      }
    };
    document.addEventListener('pointerdown', handleClickOutside);
    return () => document.removeEventListener('pointerdown', handleClickOutside);
  }, []);

  // Global Escape key handler when any menu is open
  useEffect(() => {
    const handleGlobalEsc = (e) => {
      if (e.key === 'Escape') {
        if (resourcesOpen) {
          e.preventDefault();
          setOpenDropdown(null);
          if (dropdownBtnRef.current) dropdownBtnRef.current.focus();
        } else if (accountMenuOpen) {
          e.preventDefault();
          setOpenDropdown(null);
          if (accountBtnRef.current) accountBtnRef.current.focus();
        }
      }
    };
    if (resourcesOpen || accountMenuOpen) {
      window.addEventListener('keydown', handleGlobalEsc);
    }
    return () => window.removeEventListener('keydown', handleGlobalEsc);
  }, [resourcesOpen, accountMenuOpen]);

  // Keyboard navigation for Resources trigger
  const handleDropdownKeyDown = (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      setOpenDropdown(null);
      if (dropdownBtnRef.current) dropdownBtnRef.current.focus();
    } else if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      toggleResourcesMenu();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setOpenDropdown('resources');
      setTimeout(() => {
        const first = menuItemsRef.current[0];
        if (first) first.focus();
      }, 0);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setOpenDropdown('resources');
      setTimeout(() => {
        const items = menuItemsRef.current.filter(Boolean);
        const last = items[items.length - 1];
        if (last) last.focus();
      }, 0);
    }
  };

  // Keyboard navigation inside Resources menu items
  const handleMenuItemKeyDown = (e, index) => {
    const items = menuItemsRef.current.filter(Boolean);
    const total = items.length;
    if (total === 0) return;

    if (e.key === 'Escape') {
      e.preventDefault();
      setOpenDropdown(null);
      if (dropdownBtnRef.current) dropdownBtnRef.current.focus();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      const nextIndex = (index + 1) % total;
      if (items[nextIndex]) items[nextIndex].focus();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      const prevIndex = (index - 1 + total) % total;
      if (items[prevIndex]) items[prevIndex].focus();
    } else if (e.key === 'Home') {
      e.preventDefault();
      if (items[0]) items[0].focus();
    } else if (e.key === 'End') {
      e.preventDefault();
      if (items[total - 1]) items[total - 1].focus();
    } else if (e.key === 'Tab') {
      setOpenDropdown(null);
    }
  };

  // Keyboard navigation for Account trigger
  const handleAccountTriggerKeyDown = (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      setOpenDropdown(null);
      if (accountBtnRef.current) accountBtnRef.current.focus();
    } else if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      toggleAccountMenu();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setOpenDropdown('account');
      setTimeout(() => {
        const first = accountItemsRef.current[0];
        if (first) first.focus();
      }, 0);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setOpenDropdown('account');
      setTimeout(() => {
        const items = accountItemsRef.current.filter(Boolean);
        const last = items[items.length - 1];
        if (last) last.focus();
      }, 0);
    }
  };

  // Keyboard navigation inside Account menu items
  const handleAccountItemKeyDown = (e, index) => {
    const items = accountItemsRef.current.filter(Boolean);
    if (items.length === 0) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      setOpenDropdown(null);
      if (accountBtnRef.current) accountBtnRef.current.focus();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      const nextIndex = (index + 1) % items.length;
      if (items[nextIndex]) items[nextIndex].focus();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      const prevIndex = (index - 1 + items.length) % items.length;
      if (items[prevIndex]) items[prevIndex].focus();
    } else if (e.key === 'Home') {
      e.preventDefault();
      if (items[0]) items[0].focus();
    } else if (e.key === 'End') {
      e.preventDefault();
      const last = items[items.length - 1];
      if (last) last.focus();
    } else if (e.key === 'Tab') {
      setOpenDropdown(null);
    }
  };

  // Focus trap & Esc for Mobile Drawer
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && mobileDrawerOpen) {
        setMobileDrawerOpen(false);
      }
    };

    if (mobileDrawerOpen) {
      document.addEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'hidden';

      if (drawerRef.current) {
        const focusable = drawerRef.current.querySelectorAll(
          'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'
        );
        if (focusable.length > 0) {
          focusable[0].focus();
        }

        const handleTrap = (e) => {
          if (e.key !== 'Tab') return;
          const first = focusable[0];
          const last = focusable[focusable.length - 1];
          if (e.shiftKey) {
            if (document.activeElement === first) {
              e.preventDefault();
              last.focus();
            }
          } else {
            if (document.activeElement === last) {
              e.preventDefault();
              first.focus();
            }
          }
        };

        drawerRef.current.addEventListener('keydown', handleTrap);
        return () => {
          document.removeEventListener('keydown', handleKeyDown);
          document.body.style.overflow = '';
        };
      }
    } else {
      document.body.style.overflow = '';
    }

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
    };
  }, [mobileDrawerOpen]);

  const isResourceActive =
    location.pathname === '/resources' ||
    ['/guide', '/scam-types', '/helpline-1930', '/privacy', '/terms'].includes(location.pathname);

  return (
    <div className="header-floating-wrap">
      <header className={`header-floating-bar ${isScrolled ? 'header-scrolled' : ''}`}>
        {/* Left: Logo */}
        <Link to="/" className="logo-link" aria-label="CyberShield Home">
          <Logo size={28} withWordmark={true} isDark={true} />
        </Link>

        {/* Center: Dimmed links that brighten on hover */}
        <nav className="header-center-nav" aria-label="Main Navigation">
          <NavLink
            to="/tools"
            className={({ isActive }) => `header-nav-item ${isActive ? 'active' : ''}`}
          >
            Tools
          </NavLink>
          <NavLink
            to="/verify"
            className={({ isActive }) => `header-nav-item ${isActive ? 'active' : ''}`}
          >
            Verify
          </NavLink>
          <NavLink
            to="/pricing"
            className={({ isActive }) => `header-nav-item ${isActive ? 'active' : ''}`}
          >
            Pricing
          </NavLink>
          <NavLink
            to="/how-it-works"
            className={({ isActive }) => `header-nav-item ${isActive ? 'active' : ''}`}
            onClick={closeAllMenus}
          >
            How it works
          </NavLink>

          {/* Resources Dropdown */}
          <div
            className="resources-dropdown-wrap"
            ref={dropdownRef}
          >
            <button
              ref={dropdownBtnRef}
              type="button"
              className={`header-nav-item dropdown-trigger ${isResourceActive ? 'active' : ''}`}
              aria-haspopup="menu"
              aria-expanded={resourcesOpen}
              onClick={toggleResourcesMenu}
              onKeyDown={handleDropdownKeyDown}
            >
              <span>Resources</span>
              <ChevronDown
                size={14}
                className={`dropdown-chevron ${resourcesOpen ? 'rotated' : ''}`}
              />
            </button>

            {resourcesOpen && (
              <div
                className="dropdown-menu-popover"
                role="menu"
                aria-label="Resources"
              >
                {RESOURCE_ITEMS.map((item, idx) => {
                  const Icon = item.icon;
                  return (
                    <Link
                      key={item.id}
                      ref={(el) => (menuItemsRef.current[idx] = el)}
                      to={`/resources?section=${item.id}`}
                      role="menuitem"
                      className="dropdown-menu-item"
                      onClick={() => handleResourceItemClick(item.id)}
                      onKeyDown={(e) => handleMenuItemKeyDown(e, idx)}
                    >
                      <Icon size={16} className="menu-item-icon" />
                      <div>
                        <strong className="item-title">{item.title}</strong>
                        <span className="item-desc">{item.desc}</span>
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        </nav>

        {/* Right: "Sign in" or Account menu + "Get extension" light button */}
        <div className="header-right-actions">
          {session ? (
            <div className="resources-dropdown-wrap header-account-wrap" ref={accountMenuRef}>
              <button
                ref={accountBtnRef}
                type="button"
                className="header-btn-outline header-account-trigger"
                aria-haspopup="menu"
                aria-expanded={accountMenuOpen}
                onClick={toggleAccountMenu}
                onKeyDown={handleAccountTriggerKeyDown}
                title={displayName}
              >
                <UserAvatar
                  profile={profile}
                  session={session}
                  size={22}
                  className="header-account-avatar"
                />
                <span className="header-account-name">{shortDisplayName}</span>
                <ChevronDown
                  size={13}
                  className={`dropdown-chevron ${accountMenuOpen ? 'rotated' : ''}`}
                />
              </button>

              {accountMenuOpen && (
                <div
                  className="dropdown-menu-popover account-menu-popover"
                  role="menu"
                  aria-label="Account menu"
                >
                  <div className="account-menu-header">
                    <UserAvatar
                      profile={profile}
                      session={session}
                      size={32}
                      className="account-menu-avatar-lg"
                    />
                    <div className="account-menu-meta">
                      <div className="account-menu-user-row">
                        <strong className="item-title account-menu-full-text">{displayName}</strong>
                        <span className={`account-plan-chip ${isPro ? 'chip-pro' : 'chip-free'}`}>
                          {isPro ? `Pro · ${daysLeft} ${daysLeft === 1 ? 'day' : 'days'} left` : 'Free'}
                        </span>
                      </div>
                      {fullEmail && (
                        <span className="item-desc account-menu-full-text">{fullEmail}</span>
                      )}
                      <UsagePill variant="header" />
                    </div>
                  </div>

                  <Link
                    ref={(el) => (accountItemsRef.current[0] = el)}
                    to="/dashboard"
                    role="menuitem"
                    className="dropdown-menu-item"
                    onClick={closeAllMenus}
                    onKeyDown={(e) => handleAccountItemKeyDown(e, 0)}
                  >
                    <LayoutDashboard size={16} className="menu-item-icon" />
                    <div>
                      <strong className="item-title">Dashboard</strong>
                      <span className="item-desc">Saved scan history</span>
                    </div>
                  </Link>

                  <Link
                    ref={(el) => (accountItemsRef.current[1] = el)}
                    to="/dashboard/settings"
                    role="menuitem"
                    className="dropdown-menu-item"
                    onClick={closeAllMenus}
                    onKeyDown={(e) => handleAccountItemKeyDown(e, 1)}
                  >
                    <Settings size={16} className="menu-item-icon" />
                    <div>
                      <strong className="item-title">Settings</strong>
                      <span className="item-desc">Display name &amp; account</span>
                    </div>
                  </Link>

                  <Link
                    ref={(el) => (accountItemsRef.current[2] = el)}
                    to="/pricing"
                    role="menuitem"
                    className="dropdown-menu-item"
                    onClick={closeAllMenus}
                    onKeyDown={(e) => handleAccountItemKeyDown(e, 2)}
                  >
                    <Sparkles size={16} className="menu-item-icon" />
                    <div>
                      <strong className="item-title">Upgrade</strong>
                      <span className="item-desc">Plan &amp; tier details</span>
                    </div>
                  </Link>

                  <button
                    ref={(el) => (accountItemsRef.current[3] = el)}
                    type="button"
                    role="menuitem"
                    className="dropdown-menu-item account-signout-btn"
                    onClick={async () => {
                      closeAllMenus();
                      await signOut();
                      navigate('/');
                    }}
                    onKeyDown={(e) => handleAccountItemKeyDown(e, 3)}
                  >
                    <LogOut size={16} className="menu-item-icon" />
                    <div>
                      <strong className="item-title">Sign out</strong>
                      <span className="item-desc">End current session</span>
                    </div>
                  </button>
                </div>
              )}
            </div>
          ) : (
            <Link to="/login" className="header-btn-outline">
              Sign in
            </Link>
          )}

          <Link to="/extension" className="header-btn-light">
            <BrowserIcon size={14} className="browser-icon" />
            <span>Get extension</span>
          </Link>
        </div>

        {/* Mobile Hamburger Button (< 900px) */}
        <button
          type="button"
          className="header-hamburger-btn"
          onClick={() => setMobileDrawerOpen(true)}
          aria-label="Open menu"
          aria-expanded={mobileDrawerOpen}
        >
          <Menu size={20} />
        </button>
      </header>

      {/* Mobile Drawer (Under 900px) */}
      {mobileDrawerOpen && (
        <div
          className="mobile-drawer-overlay"
          onClick={() => setMobileDrawerOpen(false)}
          role="presentation"
        >
          <div
            className="mobile-drawer-panel"
            ref={drawerRef}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="Mobile Navigation Drawer"
          >
            <div className="mobile-drawer-header">
              <Link to="/" className="logo-link" onClick={() => setMobileDrawerOpen(false)}>
                <Logo size={28} withWordmark={true} isDark={true} />
              </Link>
              <button
                type="button"
                className="drawer-close-btn"
                onClick={() => setMobileDrawerOpen(false)}
                aria-label="Close navigation"
              >
                <X size={20} />
              </button>
            </div>

            <div className="mobile-drawer-body">
              <nav className="mobile-drawer-links" aria-label="Mobile Navigation">
                <NavLink
                  to="/tools"
                  className={({ isActive }) => `drawer-link-item ${isActive ? 'active' : ''}`}
                  onClick={() => setMobileDrawerOpen(false)}
                >
                  Tools
                </NavLink>
                <NavLink
                  to="/verify"
                  className={({ isActive }) => `drawer-link-item ${isActive ? 'active' : ''}`}
                  onClick={() => setMobileDrawerOpen(false)}
                >
                  Verify
                </NavLink>
                <NavLink
                  to="/pricing"
                  className={({ isActive }) => `drawer-link-item ${isActive ? 'active' : ''}`}
                  onClick={() => setMobileDrawerOpen(false)}
                >
                  Pricing
                </NavLink>
                <NavLink
                  to="/how-it-works"
                  className={({ isActive }) => `drawer-link-item ${isActive ? 'active' : ''}`}
                  onClick={() => setMobileDrawerOpen(false)}
                >
                  How it works
                </NavLink>

                {/* Mobile Resources Collapsible */}
                <div className="mobile-resources-wrap">
                  <button
                    type="button"
                    className="drawer-link-item mobile-resources-toggle"
                    onClick={() => setMobileResourcesOpen(!mobileResourcesOpen)}
                    aria-expanded={mobileResourcesOpen}
                  >
                    <span>Resources</span>
                    <ChevronDown
                      size={16}
                      className={`dropdown-chevron ${mobileResourcesOpen ? 'rotated' : ''}`}
                    />
                  </button>

                  {mobileResourcesOpen && (
                    <div className="mobile-resources-sublist">
                      {RESOURCE_ITEMS.map((item) => (
                        <Link
                          key={item.id}
                          to={`/resources?section=${item.id}`}
                          className="mobile-sublink"
                          onClick={() => setMobileDrawerOpen(false)}
                        >
                          {item.title}
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              </nav>

              {/* Drawer Buttons at the Bottom */}
              <div className="mobile-drawer-bottom-actions">
                {session ? (
                  <>
                    <div className="account-menu-header" style={{ padding: '4px 0 8px' }}>
                      <UserAvatar
                        profile={profile}
                        session={session}
                        size={28}
                        className="account-menu-avatar-lg"
                      />
                      <div className="account-menu-meta">
                        <strong className="item-title account-menu-full-text">{displayName}</strong>
                        {fullEmail && (
                          <span className="item-desc account-menu-full-text">{fullEmail}</span>
                        )}
                        <UsagePill variant="header" />
                      </div>
                    </div>
                    <Link
                      to="/dashboard"
                      className="drawer-btn-outline"
                      onClick={() => setMobileDrawerOpen(false)}
                    >
                      Dashboard
                    </Link>
                    <Link
                      to="/dashboard/settings"
                      className="drawer-btn-outline"
                      onClick={() => setMobileDrawerOpen(false)}
                    >
                      Settings
                    </Link>
                    <Link
                      to="/pricing"
                      className="drawer-btn-outline"
                      onClick={() => setMobileDrawerOpen(false)}
                    >
                      Upgrade
                    </Link>
                    <button
                      type="button"
                      className="drawer-btn-outline"
                      onClick={async () => {
                        setMobileDrawerOpen(false);
                        await signOut();
                        navigate('/');
                      }}
                      style={{ background: 'transparent', cursor: 'pointer' }}
                    >
                      Sign out
                    </button>
                  </>
                ) : (
                  <Link
                    to="/login"
                    className="drawer-btn-outline"
                    onClick={() => setMobileDrawerOpen(false)}
                  >
                    Sign in
                  </Link>
                )}
                <Link
                  to="/extension"
                  onClick={() => setMobileDrawerOpen(false)}
                  className="drawer-btn-light"
                >
                  <BrowserIcon size={16} className="browser-icon" />
                  <span>Get extension</span>
                </Link>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Header;
