'use client';

import { Toaster as Sonner } from 'sonner';

type ToasterProps = React.ComponentProps<typeof Sonner>;

const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      theme="dark"
      className="toaster group"
      toastOptions={{
        classNames: {
          toast:
            'group toast group-[.toaster]:bg-slate-800 group-[.toaster]:text-slate-200 group-[.toaster]:border-slate-700 group-[.toaster]:shadow-lg',
          description: 'group-[.toast]:text-slate-400',
          actionButton:
            'group-[.toast]:bg-emerald-600 group-[.toast]:text-white',
          cancelButton:
            'group-[.toast]:bg-slate-700 group-[.toast]:text-slate-300',
          success: 'group-[.toaster]:!bg-emerald-900/50 group-[.toaster]:!border-emerald-700',
          error: 'group-[.toaster]:!bg-red-900/50 group-[.toaster]:!border-red-700',
        },
      }}
      {...props}
    />
  );
};

export { Toaster };
