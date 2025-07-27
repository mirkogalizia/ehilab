import * as React from 'react';

export const Textarea = React.forwardRef(({ className, ...props }, ref) => {
  return (
    <textarea
      ref={ref}
      className={`w-full rounded-md border border-gray-300 p-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 ${className}`}
      {...props}
    />
  );
});

Textarea.displayName = 'Textarea';
