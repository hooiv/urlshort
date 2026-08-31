export interface BioTheme {
  id: string;
  name: string;
  description: string;
  pageBg: string;
  containerBg: string;
  textPrimary: string;
  textSecondary: string;
  buttonBg: string;
  buttonBorder: string;
  buttonText: string;
  buttonHover: string;
  accent: string;
  previewGradient: string;
}

export const BIO_THEMES: Record<string, BioTheme> = {
  midnight: {
    id: 'midnight',
    name: 'Midnight Onyx',
    description: 'Frosted dark obsidian with electric blue glow',
    pageBg: 'bg-slate-950',
    containerBg: 'bg-slate-900/60 backdrop-blur-xl border border-slate-800',
    textPrimary: 'text-white',
    textSecondary: 'text-slate-400',
    buttonBg: 'bg-slate-900/80 hover:bg-slate-800',
    buttonBorder: 'border border-slate-700/60 hover:border-blue-500/50',
    buttonText: 'text-slate-100',
    buttonHover: 'hover:scale-[1.01] hover:shadow-lg hover:shadow-blue-500/10',
    accent: '#3b82f6',
    previewGradient: 'from-slate-950 via-slate-900 to-blue-950',
  },
  cyberpunk: {
    id: 'cyberpunk',
    name: 'Cyberpunk Neon',
    description: 'High-voltage violet and cyan neon aesthetic',
    pageBg: 'bg-black',
    containerBg: 'bg-zinc-950/80 backdrop-blur-xl border border-fuchsia-500/30 shadow-2xl shadow-fuchsia-500/10',
    textPrimary: 'text-cyan-300',
    textSecondary: 'text-fuchsia-300/80',
    buttonBg: 'bg-zinc-900/90 hover:bg-zinc-800',
    buttonBorder: 'border border-cyan-500/40 hover:border-fuchsia-400',
    buttonText: 'text-cyan-100',
    buttonHover: 'hover:scale-[1.01] hover:shadow-lg hover:shadow-cyan-500/20',
    accent: '#06b6d4',
    previewGradient: 'from-black via-purple-950 to-cyan-950',
  },
  'minimal-light': {
    id: 'minimal-light',
    name: 'Studio Minimal',
    description: 'Crisp, airy Apple-style monochrome elegance',
    pageBg: 'bg-stone-50',
    containerBg: 'bg-white/90 backdrop-blur-xl border border-stone-200 shadow-xl shadow-stone-200/50',
    textPrimary: 'text-stone-900',
    textSecondary: 'text-stone-500',
    buttonBg: 'bg-stone-900 hover:bg-black',
    buttonBorder: 'border border-stone-900',
    buttonText: 'text-white',
    buttonHover: 'hover:scale-[1.01] hover:shadow-md',
    accent: '#1c1917',
    previewGradient: 'from-stone-100 via-stone-200 to-white',
  },
  sunset: {
    id: 'sunset',
    name: 'Sunset Radiant',
    description: 'Warm dusk twilight with amber & coral hues',
    pageBg: 'bg-gradient-to-br from-amber-950 via-slate-950 to-rose-950',
    containerBg: 'bg-slate-900/70 backdrop-blur-xl border border-rose-500/20',
    textPrimary: 'text-amber-100',
    textSecondary: 'text-rose-200/70',
    buttonBg: 'bg-gradient-to-r from-amber-500/20 to-rose-500/20 hover:from-amber-500/30 hover:to-rose-500/30',
    buttonBorder: 'border border-amber-500/40 hover:border-rose-400',
    buttonText: 'text-amber-50',
    buttonHover: 'hover:scale-[1.01] hover:shadow-lg hover:shadow-rose-500/20',
    accent: '#f59e0b',
    previewGradient: 'from-amber-600 via-rose-600 to-purple-800',
  },
  emerald: {
    id: 'emerald',
    name: 'Emerald Luxury',
    description: 'Deep royal jade with polished gold accents',
    pageBg: 'bg-gradient-to-br from-emerald-950 via-slate-950 to-teal-950',
    containerBg: 'bg-slate-900/80 backdrop-blur-xl border border-emerald-500/30',
    textPrimary: 'text-emerald-100',
    textSecondary: 'text-teal-300/70',
    buttonBg: 'bg-emerald-950/70 hover:bg-emerald-900/80',
    buttonBorder: 'border border-emerald-500/40 hover:border-emerald-300',
    buttonText: 'text-emerald-50',
    buttonHover: 'hover:scale-[1.01] hover:shadow-lg hover:shadow-emerald-500/20',
    accent: '#10b981',
    previewGradient: 'from-emerald-950 via-teal-900 to-slate-950',
  },
  'rose-gold': {
    id: 'rose-gold',
    name: 'Velvet Rose',
    description: 'Sophisticated modern blush velvet glass',
    pageBg: 'bg-gradient-to-br from-pink-950 via-slate-950 to-purple-950',
    containerBg: 'bg-slate-900/80 backdrop-blur-xl border border-pink-500/20',
    textPrimary: 'text-pink-100',
    textSecondary: 'text-pink-300/70',
    buttonBg: 'bg-pink-950/60 hover:bg-pink-900/70',
    buttonBorder: 'border border-pink-500/30 hover:border-pink-300',
    buttonText: 'text-pink-50',
    buttonHover: 'hover:scale-[1.01] hover:shadow-lg hover:shadow-pink-500/20',
    accent: '#ec4899',
    previewGradient: 'from-pink-900 via-purple-950 to-slate-950',
  },
};

export function getTheme(themeId?: string | null): BioTheme {
  return (themeId && BIO_THEMES[themeId]) || BIO_THEMES.midnight;
}
