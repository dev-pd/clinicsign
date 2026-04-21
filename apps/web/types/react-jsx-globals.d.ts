import type * as React from "react";

/** React 19 types expose JSX under `React.JSX`; restore global `JSX` for existing `JSX.Element` annotations. */
declare global {
  namespace JSX {
    type Element = React.JSX.Element;
    type ElementType = React.JSX.ElementType;
    interface ElementClass extends React.JSX.ElementClass {}
    interface ElementAttributesProperty extends React.JSX.ElementAttributesProperty {}
    interface ElementChildrenAttribute extends React.JSX.ElementChildrenAttribute {}
    type LibraryManagedAttributes<C, P> = React.JSX.LibraryManagedAttributes<C, P>;
    interface IntrinsicAttributes extends React.JSX.IntrinsicAttributes {}
    interface IntrinsicClassAttributes<T> extends React.JSX.IntrinsicClassAttributes<T> {}
    interface IntrinsicElements extends React.JSX.IntrinsicElements {}
  }
}

export {};
