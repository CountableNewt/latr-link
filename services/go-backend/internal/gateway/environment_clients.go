package gateway

import (
	"fmt"
	"os"
)

func clientsFromEnvironment() (Clients, error) {
	clients, err := ParseClients(os.Getenv("LATR_GATEWAY_OFFICIAL_CLIENT_CREDENTIALS"))
	if err != nil {
		return nil, fmt.Errorf("LATR_GATEWAY_OFFICIAL_CLIENT_CREDENTIALS: %w", err)
	}
	raw := os.Getenv("LATR_GATEWAY_ADDITIONAL_CLIENT_CREDENTIALS")
	if raw == "" {
		return clients, nil
	}
	additional, err := ParseClients(raw)
	if err != nil {
		return nil, fmt.Errorf("LATR_GATEWAY_ADDITIONAL_CLIENT_CREDENTIALS: %w", err)
	}
	// Separate configuration permits adding clients or overlapping rotations
	// without recovering or replacing the existing deployment's secret map.
	for id, credential := range additional {
		if existing, ok := clients[id]; ok {
			clients[id] = existing + "|" + credential
		} else {
			clients[id] = credential
		}
	}
	return clients, nil
}
