import { installPeek } from "../peek/peek.ts";

const INJECTION_MARKER = "arcLikePeek";

document.documentElement.dataset[INJECTION_MARKER] = "ready";
installPeek(document);
