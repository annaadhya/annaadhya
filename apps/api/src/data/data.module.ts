/** Wires the DataClient (Firestore in production, in-memory mock in dev/test) + AuthService. */
import { type Provider } from "@nestjs/common";
import {
  FirestoreDataClient,
  InMemoryDataClient,
  parseFirestoreCredentials,
  type DataClient,
} from "@annaadhya/data-core";
import { loadEnv, type ApiEnv } from "../config/env";
import { AuthService } from "../common/auth/auth.service";
import { DATA_CLIENT, API_ENV } from "../app.tokens";

// Re-exported for the many services that import these tokens from data.module.
// The declarations live in app.tokens.ts to break the auth.service import cycle.
export { DATA_CLIENT, API_ENV };

export const dataProviders: Provider[] = [
  {
    provide: API_ENV,
    useFactory: () => loadEnv(),
  },
  {
    provide: DATA_CLIENT,
    useFactory: (env: ApiEnv): DataClient => {
      if (env.DATA_PROVIDER === "firestore") {
        const creds = parseFirestoreCredentials(process.env);
        if (!creds) {
          throw new Error(
            "DATA_PROVIDER=firestore requires FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL and FIREBASE_PRIVATE_KEY.",
          );
        }
        return new FirestoreDataClient(creds);
      }
      return new InMemoryDataClient({ nodeEnv: env.NODE_ENV });
    },
    inject: [API_ENV],
  },
  {
    provide: AuthService,
    useFactory: (data: DataClient, env: ApiEnv) => new AuthService(data, env),
    inject: [DATA_CLIENT, API_ENV],
  },
];
