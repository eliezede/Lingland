import React, { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { Menu, X } from 'lucide-react';
import { BrandLogo } from './BrandLogo';

interface PublicNavbarProps {
    transparent?: boolean;
    theme?: 'light' | 'dark';
}

export const PublicNavbar: React.FC<PublicNavbarProps> = ({
    transparent = false,
    theme = 'light'
}) => {
    const { user } = useAuth();
    const location = useLocation();
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
    const [scrolled, setScrolled] = useState(false);

    useEffect(() => {
        const handleScroll = () => {
            setScrolled(window.scrollY > 20);
        };
        window.addEventListener('scroll', handleScroll);
        return () => window.removeEventListener('scroll', handleScroll);
    }, []);

    const isActive = (path: string) => location.pathname === path;

    // Theme-based colors
    const isDarkTheme = theme === 'dark';

    const navBg = scrolled
        ? (isDarkTheme ? 'bg-slate-950/90 border-b border-white/5' : 'bg-white/90 border-b border-slate-100')
        : (transparent ? 'bg-transparent' : (isDarkTheme ? 'bg-slate-950' : 'bg-white'));

    const textColor = scrolled
        ? (isDarkTheme ? 'text-white' : 'text-slate-900')
        : (transparent
            ? (isDarkTheme ? 'text-white' : 'text-slate-900 lg:text-white')
            : (isDarkTheme ? 'text-white' : 'text-slate-900'));

    const linkBaseClass = (path: string) => {
        const active = isActive(path);
        if (scrolled) {
            if (isDarkTheme) {
                return active ? 'text-white bg-white/10' : 'text-slate-400 hover:text-white hover:bg-white/5';
            }
            return active ? 'text-blue-600 bg-blue-50' : 'text-slate-600 hover:text-blue-600 hover:bg-slate-50';
        }
        if (transparent) {
            if (isDarkTheme) {
                return active ? 'text-white bg-white/10' : 'text-slate-300 hover:text-white hover:bg-white/10';
            }
            return active ? 'text-white bg-white/20' : 'text-slate-300 hover:text-white hover:bg-white/10';
        }
        // Fixed background
        if (isDarkTheme) {
            return active ? 'text-white bg-white/10' : 'text-slate-400 hover:text-white hover:bg-white/5';
        }
        return active ? 'text-blue-600 bg-blue-50' : 'text-slate-600 hover:text-blue-600 hover:bg-slate-50';
    };

    return (
        <nav className={`fixed top-0 w-full z-50 transition-all duration-300 backdrop-blur-md ${navBg} ${scrolled ? 'py-4 shadow-sm' : 'py-6'}`}>
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="flex justify-between items-center">
                    {/* Logo */}
                    <Link to="/" className="flex items-center cursor-pointer group">
                        <BrandLogo
                            variant="wordmark"
                            tone="inherit"
                            size="sm"
                            className={`transition-all duration-300 group-hover:scale-[1.02] ${textColor}`}
                        />
                    </Link>

                    {/* Desktop Links */}
                    <div className="hidden md:flex space-x-1 items-center">
                        <Link to="/why-us" className={`px-4 py-2 text-sm font-bold rounded-full transition-all ${linkBaseClass('/why-us')}`}>Why Us</Link>
                        <Link to="/services" className={`px-4 py-2 text-sm font-bold rounded-full transition-all ${linkBaseClass('/services')}`}>Services</Link>
                        <Link to="/interpreters" className={`px-4 py-2 text-sm font-bold rounded-full transition-all ${linkBaseClass('/interpreters')}`}>For Interpreters</Link>
                    </div>

                    <div className="hidden md:flex items-center space-x-4">
                        {user ? (
                            <Link
                                to={(user.role === 'ADMIN' || user.role === 'SUPER_ADMIN') ? '/admin/dashboard' : user.role === 'CLIENT' ? '/client/dashboard' : '/interpreter/dashboard'}
                                className={`px-6 py-2.5 text-sm font-bold rounded-full transition-all shadow-lg hover:-translate-y-0.5 ${scrolled
                                        ? (isDarkTheme ? 'bg-white text-blue-900 hover:bg-blue-50' : 'bg-slate-900 text-white hover:bg-slate-800 shadow-slate-900/20')
                                        : (isDarkTheme ? 'bg-white text-blue-900 hover:bg-blue-50' : (transparent ? 'bg-white text-blue-900 hover:bg-blue-50 shadow-black/10' : 'bg-slate-900 text-white hover:bg-slate-800'))
                                    }`}
                            >
                                Dashboard
                            </Link>
                        ) : (
                            <>
                                <Link to="/login" className={`text-sm font-bold transition-colors ${scrolled
                                        ? (isDarkTheme ? 'text-white hover:text-blue-400' : 'text-slate-900 hover:text-blue-600')
                                        : (isDarkTheme ? 'text-white hover:text-blue-300' : (transparent ? 'text-white hover:text-blue-200' : 'text-slate-900 hover:text-blue-600'))
                                    }`}>
                                    Log in
                                </Link>
                                <Link
                                    to="/request"
                                    className="px-6 py-2.5 bg-blue-600 text-white text-sm font-bold rounded-full hover:bg-blue-500 transition-all shadow-lg shadow-blue-500/30 hover:shadow-blue-500/50 hover:-translate-y-0.5"
                                >
                                    Book Now
                                </Link>
                            </>
                        )}
                    </div>

                    {/* Mobile Menu Button */}
                    <div className="md:hidden">
                        <button onClick={() => setMobileMenuOpen(!mobileMenuOpen)} className={`p-2 rounded-lg transition-colors ${scrolled
                                ? (isDarkTheme ? 'text-white hover:bg-white/10' : 'text-slate-900 hover:bg-slate-100')
                                : (isDarkTheme ? 'text-white hover:bg-white/10' : (transparent ? 'text-white hover:bg-white/10' : 'text-slate-900 hover:bg-slate-100'))
                            }`}>
                            {mobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
                        </button>
                    </div>
                </div>
            </div>

            {/* Mobile Menu Overlay */}
            {mobileMenuOpen && (
                <div className={`md:hidden absolute top-full left-0 w-full border-b shadow-xl animate-in slide-in-from-top-4 duration-300 ${isDarkTheme ? 'bg-slate-950 border-white/5 text-white' : 'bg-white border-slate-100 text-slate-900'
                    }`}>
                    <div className="p-6 space-y-4">
                        <Link to="/why-us" className={`block w-full text-left p-4 rounded-xl font-bold ${isActive('/why-us') ? (isDarkTheme ? 'bg-white/10' : 'bg-blue-50 text-blue-600') : (isDarkTheme ? 'hover:bg-white/5 text-slate-300' : 'hover:bg-slate-50 text-slate-700')}`} onClick={() => setMobileMenuOpen(false)}>Why Us</Link>
                        <Link to="/services" className={`block w-full text-left p-4 rounded-xl font-bold ${isActive('/services') ? (isDarkTheme ? 'bg-white/10' : 'bg-blue-50 text-blue-600') : (isDarkTheme ? 'hover:bg-white/5 text-slate-300' : 'hover:bg-slate-50 text-slate-700')}`} onClick={() => setMobileMenuOpen(false)}>Services</Link>
                        <Link to="/interpreters" className={`block w-full text-left p-4 rounded-xl font-bold ${isActive('/interpreters') ? (isDarkTheme ? 'bg-white/10' : 'bg-blue-50 text-blue-600') : (isDarkTheme ? 'hover:bg-white/5 text-slate-300' : 'hover:bg-slate-50 text-slate-700')}`} onClick={() => setMobileMenuOpen(false)}>Interpreters</Link>
                        <div className={`pt-4 border-t flex flex-col gap-3 ${isDarkTheme ? 'border-white/5' : 'border-slate-100'}`}>
                            {user ? (
                                <Link
                                    to={(user.role === 'ADMIN' || user.role === 'SUPER_ADMIN') ? '/admin/dashboard' : user.role === 'CLIENT' ? '/client/dashboard' : '/interpreter/dashboard'}
                                    className={`w-full py-4 text-center font-bold rounded-2xl shadow-lg ${isDarkTheme ? 'text-blue-900 bg-white' : 'text-white bg-slate-900'}`}
                                    onClick={() => setMobileMenuOpen(false)}
                                >
                                    Dashboard
                                </Link>
                            ) : (
                                <>
                                    <Link to="/login" className={`w-full py-4 text-center font-bold rounded-2xl ${isDarkTheme ? 'text-white bg-white/5' : 'text-slate-900 bg-slate-100'}`} onClick={() => setMobileMenuOpen(false)}>Log in</Link>
                                    <Link to="/request" className="w-full py-4 text-center font-bold text-white bg-blue-600 rounded-2xl shadow-lg shadow-blue-500/20" onClick={() => setMobileMenuOpen(false)}>Book Now</Link>
                                </>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </nav>
    );
};
