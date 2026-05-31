import React, { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';

interface ContextMenuActionItem {
    label: string;
    icon?: React.ElementType;
    onClick: () => void;
    variant?: 'default' | 'danger';
}

interface ContextMenuDividerItem {
    divider: true;
}

export type ContextMenuItem = ContextMenuActionItem | ContextMenuDividerItem;

interface ContextMenuProps {
    children: React.ReactElement;
    items: ContextMenuItem[];
}

export const ContextMenu: React.FC<ContextMenuProps> = ({ children, items }) => {
    const [visible, setVisible] = useState(false);
    const [position, setPosition] = useState({ x: 0, y: 0 });

    const handleContextMenu = useCallback((e: React.MouseEvent) => {
        e.preventDefault();
        setPosition({ x: e.clientX, y: e.clientY });
        setVisible(true);
    }, []);

    const closeMenu = useCallback(() => {
        setVisible(false);
    }, []);

    useEffect(() => {
        if (visible) {
            window.addEventListener('click', closeMenu);
            window.addEventListener('scroll', closeMenu);
        }
        return () => {
            window.removeEventListener('click', closeMenu);
            window.removeEventListener('scroll', closeMenu);
        };
    }, [visible, closeMenu]);

    return (
        <>
            {React.cloneElement(children as React.ReactElement<any>, {
                onContextMenu: handleContextMenu
            })}

            {visible && createPortal(
                <div
                    className="fixed z-[100] min-w-[180px] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-100 p-1.5"
                    style={{ top: position.y, left: position.x }}
                >
                    {items.map((item, index) => (
                        <React.Fragment key={index}>
                            {'divider' in item ? (
                                <div className="my-1 border-t border-slate-100 dark:border-slate-800" />
                            ) : (
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        item.onClick();
                                        closeMenu();
                                    }}
                                    className={`w-full flex items-center space-x-3 px-3 py-2 text-sm font-medium rounded-lg transition-colors text-left
                    ${item.variant === 'danger'
                                            ? 'text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20'
                                            : 'text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white'
                                        }`}
                                >
                                    {item.icon && <item.icon size={16} className="shrink-0" />}
                                    <span>{item.label}</span>
                                </button>
                            )}
                        </React.Fragment>
                    ))}
                </div>,
                document.body
            )}
        </>
    );
};
