import { Button, type ButtonProps } from '../../../components/ui/button';

export function LearningButton({
  tone = 'primary',
  className = '',
  ...props
}: ButtonProps & { tone?: 'primary' | 'secondary' | 'quiet' }) {
  return (
    <Button {...props} className={`v-button v-button-${tone} ${className}`} />
  );
}
