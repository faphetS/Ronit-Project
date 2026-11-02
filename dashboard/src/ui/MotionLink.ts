import { motion } from "motion/react";
import { Link } from "react-router";

/** A React Router link that takes Motion props (press feedback, layout). */
export const MotionLink = motion.create(Link);
