import type { VehicleType } from '../engine/gameState'

export const VEHICLE_ICON: Record<VehicleType, string> = {
  truck: '🚛',
  plane: '✈️',
  ship: '🚢',
}

export const VEHICLE_LABEL: Record<VehicleType, string> = {
  truck: 'Truck',
  plane: 'Plane',
  ship: 'Ship',
}
