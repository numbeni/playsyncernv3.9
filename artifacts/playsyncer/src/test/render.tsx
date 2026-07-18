import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render as rtlRender, RenderOptions } from "@testing-library/react";
import { ReactElement, ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import { GamesProvider } from "@/hooks/useGames";

interface CustomOptions extends Omit<RenderOptions, "wrapper"> {
  withGamesProvider?: boolean;
  initialRoute?: string;
}

function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        staleTime: 0,
        refetchOnWindowFocus: false,
      },
      mutations: { retry: false },
    },
  });
}

function AllTheProviders({
  children,
  withGamesProvider,
  initialRoute,
}: {
  children: ReactNode;
  withGamesProvider?: boolean;
  initialRoute?: string;
}) {
  const content = withGamesProvider ? (
    <GamesProvider>{children}</GamesProvider>
  ) : (
    children
  );

  return (
    <MemoryRouter
      initialEntries={initialRoute ? [initialRoute] : ["/"]}
    >
      <QueryClientProvider client={createTestQueryClient()}>{content}</QueryClientProvider>
    </MemoryRouter>
  );
}

export function render(ui: ReactElement, options: CustomOptions = {}) {
  const { withGamesProvider, initialRoute, ...rest } = options;
  return rtlRender(ui, {
    wrapper: (props) => (
      <AllTheProviders
        {...props}
        withGamesProvider={withGamesProvider}
        initialRoute={initialRoute}
      />
    ),
    ...rest,
  });
}
