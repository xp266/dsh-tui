import './runtime/prod-react.ts'
/**
 * Shared react/ink runtime for third-party TUI plugins.
 *
 * Plugin authors must import react and ink from this entry instead of adding
 * them as dependencies: the profile module graph only contains what dshtui
 * itself links, so a separate react install forks the React instance and
 * breaks hooks. Re-exporting keeps module identity identical to dshtui's
 * own copy while the bundler treats both as externals.
 */
export { default as React, Children, Component, Fragment, Profiler, StrictMode, Suspense, createContext, createElement, createRef, forwardRef, isValidElement, lazy, memo, startTransition, useCallback, useContext, useDebugValue, useDeferredValue, useEffect, useId, useImperativeHandle, useLayoutEffect, useMemo, useOptimistic, useReducer, useRef, useState, useSyncExternalStore, useTransition } from 'react'
export { Box, Text, Static, useApp, useInput, useStdin, useStdout, useFocus, useFocusManager, measureElement } from 'ink'
