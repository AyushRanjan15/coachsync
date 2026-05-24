import {
  CognitoUserPool,
  CognitoUser,
  AuthenticationDetails,
  CognitoUserSession,
} from 'amazon-cognito-identity-js';
import config from './config';

let _pool: CognitoUserPool | null = null;
function getPool(): CognitoUserPool {
  if (!_pool) {
    _pool = new CognitoUserPool({
      UserPoolId: config.userPoolId,
      ClientId: config.userPoolClientId,
    });
  }
  return _pool;
}

export function signIn(email: string, password: string): Promise<CognitoUserSession> {
  const pool = getPool();
  return new Promise((resolve, reject) => {
    const user = new CognitoUser({ Username: email, Pool: pool });
    user.authenticateUser(
      new AuthenticationDetails({ Username: email, Password: password }),
      { onSuccess: resolve, onFailure: reject },
    );
  });
}

export function signOut(): void {
  getPool().getCurrentUser()?.signOut();
}

function getSession(): Promise<CognitoUserSession | null> {
  return new Promise((resolve) => {
    const user = getPool().getCurrentUser();
    if (!user) return resolve(null);
    user.getSession((err: Error | null, session: CognitoUserSession | null) => {
      resolve(err || !session?.isValid() ? null : session);
    });
  });
}

export async function getIdToken(): Promise<string | null> {
  const session = await getSession();
  return session?.getIdToken().getJwtToken() ?? null;
}

export async function getGroups(): Promise<string[]> {
  const session = await getSession();
  if (!session) return [];
  const groups = session.getIdToken().decodePayload()['cognito:groups'];
  return Array.isArray(groups) ? (groups as string[]) : [];
}
