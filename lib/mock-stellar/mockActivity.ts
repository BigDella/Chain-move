export const mockActivity = [
  {
    id: "activity-1",
    timestamp: new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString(),
    type: "Funding Pool",
    amount: "500.00",
    status: "Completed",
  },
  {
    id: "activity-2",
    timestamp: new Date(Date.now() - 1000 * 60 * 60 * 48).toISOString(),
    type: "Pool Investment",
    amount: "1000.00",
    status: "Completed",
  },
  {
    id: "activity-3",
    timestamp: new Date(Date.now() - 1000 * 60 * 60 * 72).toISOString(),
    type: "Reward Distribution",
    amount: "50.00",
    status: "Completed",
  },
  {
    id: "activity-4",
    timestamp: new Date(Date.now() - 1000 * 60 * 60 * 96).toISOString(),
    type: "Wallet Funding",
    amount: "2000.00",
    status: "Completed",
  },
]
