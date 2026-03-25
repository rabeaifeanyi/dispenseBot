'use client';

import { createContext, useContext, ReactNode } from 'react';
import { usePathname } from 'next/navigation';

interface DemoContextType {
  isDemo: boolean;
  mockInventory: any[];
  mcConnected: boolean | null;
}

const DemoContext = createContext<DemoContextType>({
  isDemo: false,
  mockInventory: [],
  mcConnected: true,
});

export const DEMO_MAGAZINE_SIZE = 17;

export const mockInventory = [
  {
    id: '1',
    component: { id: '1', name: 'PART1', type: 'PART1' },
    totalStock: DEMO_MAGAZINE_SIZE * 2,
    currentMagazineStock: DEMO_MAGAZINE_SIZE,
    magazineSize: DEMO_MAGAZINE_SIZE,
    magazineCount: 2,
    maxOrderQuantity: 5,
    warningStock: 10,
  },
  {
    id: '2',
    component: { id: '2', name: 'PART2', type: 'PART2' },
    totalStock: DEMO_MAGAZINE_SIZE * 2,
    currentMagazineStock: DEMO_MAGAZINE_SIZE,
    magazineSize: DEMO_MAGAZINE_SIZE,
    magazineCount: 2,
    maxOrderQuantity: 5,
    warningStock: 10,
  },
  {
    id: '3',
    component: { id: '3', name: 'PART3', type: 'PART3' },
    totalStock: DEMO_MAGAZINE_SIZE * 2,
    currentMagazineStock: DEMO_MAGAZINE_SIZE,
    magazineSize: DEMO_MAGAZINE_SIZE,
    magazineCount: 2,
    maxOrderQuantity: 5,
    warningStock: 10,
  },
  {
    id: '4',
    component: { id: '4', name: 'PART4', type: 'PART4' },
    totalStock: DEMO_MAGAZINE_SIZE * 2,
    currentMagazineStock: DEMO_MAGAZINE_SIZE,
    magazineSize: DEMO_MAGAZINE_SIZE,
    magazineCount: 2,
    maxOrderQuantity: 5,
    warningStock: 10,
  },
  {
    id: '5',
    component: { id: '5', name: 'PART5', type: 'PART5' },
    totalStock: DEMO_MAGAZINE_SIZE * 2,
    currentMagazineStock: DEMO_MAGAZINE_SIZE,
    magazineSize: DEMO_MAGAZINE_SIZE,
    magazineCount: 2,
    maxOrderQuantity: 5,
    warningStock: 10,
  },
];

export function DemoProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const isDemo = /\/demo(\/|$)/.test(pathname);

  return (
    <DemoContext.Provider
      value={{
        isDemo,
        mockInventory: isDemo ? mockInventory : [],
        mcConnected: isDemo ? true : null,
      }}
    >
      {children}
    </DemoContext.Provider>
  );
}

export function useDemo() {
  return useContext(DemoContext);
}
